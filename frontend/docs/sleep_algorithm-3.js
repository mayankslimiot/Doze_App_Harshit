/*
 * sleep_algorithm.js — Dozemate sleep staging reference implementation.
 *
 * Runnable, dependency-free reference for docs/SLEEP_ALGORITHM.md.
 * The firmware streams raw per-30 s-epoch features over JSON6; this file does the
 * app/server side: baselines, classification, REM gate + smoothing, hypnogram,
 * metrics and sleep score.
 *
 *   Node:     node sleep_algorithm.js            (runs the demo at the bottom)
 *   Browser:  include the file, call SleepAlgo.analyseNight(epochs)
 *
 * SPDX-License-Identifier: Apache-2.0
 */
'use strict';

/* ------------------------------------------------------------------ config -- */
const CFG = {
  EPOCH_SEC: 30,            // one epoch = 30 s = 0.5 min
  SD_MIN: 3,               // min medians for a valid rolling SD (fallback calc)
  DEEP_MIN_EPOCHS: 10,     // Deep run < 10 epochs (5 min) -> Light
  REM_MIN_EPOCHS: 6,       // REM  run <  6 epochs (3 min) -> Light
  // Arousal debounce (RECOMMENDED, beyond the base workbook): an Awake run
  // shorter than this AFTER sleep onset is a brief arousal -> Light, so it is
  // NOT counted as an awakening and not added to WASO. Set to 0 or 1 to disable
  // and reproduce the raw workbook (every brief movement -> an awakening).
  AWAKE_MIN_EPOCHS: 4,     // < 4 epochs (< 2 min) after onset -> arousal -> Light.
                           // Per SLEEP_ALGORITHM_UPDATED_AWAKE_RULES.md.
  // Awake rules (spec 7/12): movement ALONE is NOT Awake. Movement counts toward
  // Awake only within MOVEMENT_AWAKE_WINDOW_S AND with physiological confirmation
  // (HR/RR up, HR rise, HR/RR instability, or an RMSSD drop).
  MOVEMENT_AWAKE_WINDOW_S: 60,  // s: movement is an arousal candidate only within this
  HR_RISE_AWAKE_BPM: 5,         // HR_M rise vs mean of previous 2 epochs => arousal
  // RMSSD < FRAC*baseline = "clearly below the night median". Used for the
  // movement-Awake confirmation AND (extension beyond the base spec) as the Deep
  // veto / REM support: high RMSSD => parasympathetic => Deep; low => sympathetic => REM.
  RMSSD_AWAKE_FRAC: 0.85,
  RMSSD_SCORE_PTS: 1.5,         // max ± recovery-score points from sleeping RMSSD level
  NO_MST: 99999,           // T_LAST_TURN when no MST yet
};

/*
 * Sleep-quality rating vs. score. NOTE: quality (score) and sleep EFFICIENCY are
 * DIFFERENT metrics and will not match:
 *   - efficiency = % of time-in-bed spent asleep (wake subtracted). One number.
 *   - score/quality = composite that ALSO penalises low Deep%, low REM% and
 *     fragmentation (WASO, awakenings). A night can be very efficient (little
 *     wake) yet score low if Deep/REM are poor — that is by design.
 */
const QUALITY_TABLE = [
  { range: '>85',   test: (s) => s > 85,              label: 'Excellent', msg: 'Very good sleep quality' },
  { range: '70-85', test: (s) => s >= 70 && s <= 85,  label: 'Good',      msg: 'Good sleep quality' },
  { range: '55-70', test: (s) => s >= 55 && s < 70,   label: 'Fair',      msg: 'Average or disturbed sleep' },
  { range: '<55',   test: (s) => s < 55,              label: 'Poor',      msg: 'Poor sleep quality' },
];
function qualityFor(score) {
  return QUALITY_TABLE.find((q) => q.test(score)) || QUALITY_TABLE[QUALITY_TABLE.length - 1];
}

/* ------------------------------------------------------------------ math ---- */
const isNum = (v) => typeof v === 'number' && isFinite(v);
function mean(a) { return a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0; }
function stddevPop(a) {                       // population SD (÷N), matches firmware
  if (a.length < 1) return null;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / a.length);
}
function percentile(a, p) {                   // linear-interpolation percentile
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const rank = (p / 100) * (s.length - 1);
  const lo = Math.floor(rank), hi = Math.ceil(rank);
  return lo === hi ? s[lo] : s[lo] + (rank - lo) * (s[hi] - s[lo]);
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* -------------------------------------------------- 1. epochs from JSON6 ---- */
/*
 * records: array of parsed JSON6 payloads in time order, each the `data` object,
 * e.g. { TS:1751.., HR_M:"72", Res_M:"16", HR_SD:"3.50", RESSD:"1.20",
 *        MS_B:"0", SN_B:"0", MS:"", MST:"", ... }.
 * Epoch fields are populated once per 30 s (blank on the four intervening 6 s
 * records); MS_B present => this is an epoch-boundary record.
 */
function num(x) { return (x === '' || x == null) ? null : Number(x); }

function collectEpochs(records) {
  const epochs = [];
  let lastMST = null;                         // unix seconds of last motion-stop
  for (const d of records) {
    const mst = num(d.MST); if (isNum(mst)) lastMST = mst;
    if (d.MS_B === '' || d.MS_B == null) continue;   // not an epoch boundary
    epochs.push({
      t: num(d.TS),
      HR_M: num(d.HR_M),
      Res_M: (num(d.Res_M) || null),          // ignore 0
      HR_SD_5M: num(d.HR_SD),                  // firmware rolling SD (may be null)
      RR_SD_5M: num(d.RESSD),
      RMSSD: num(d.RMSSD),                     // HRV RMSSD (ms) from JSON6 (may be null)
      MS_B: num(d.MS_B) ? 1 : 0,
      MS_I: num(d.MS_I),
      SN_B: num(d.SN_B) ? 1 : 0,
      lastMST,
    });
  }
  return epochs;
}

/* ------------------------------------------------- 2. per-epoch derived ---- */
function derive(epochs) {
  // HR_SD_5M / RR_SD_5M come from the firmware. Fallback: compute rolling if the
  // firmware field is missing (keeps this reference correct on partial data).
  const hrHist = [], rrHist = [];
  for (const e of epochs) {
    if (isNum(e.HR_M)) { hrHist.push(e.HR_M); if (hrHist.length > 10) hrHist.shift(); }
    if (isNum(e.Res_M)) { rrHist.push(e.Res_M); if (rrHist.length > 10) rrHist.shift(); }
    if (!isNum(e.HR_SD_5M)) e.HR_SD_5M = hrHist.length >= CFG.SD_MIN ? stddevPop(hrHist) : null;
    if (!isNum(e.RR_SD_5M)) e.RR_SD_5M = rrHist.length >= CFG.SD_MIN ? stddevPop(rrHist) : null;
    e.T_LAST_TURN = isNum(e.lastMST) ? (e.t - e.lastMST) : CFG.NO_MST;
  }
}

/* -------------------------------------------------------- 3. baselines ---- */
function nightBaselines(epochs) {
  const hr = epochs.map(e => e.HR_M).filter(isNum);
  const rr = epochs.map(e => e.Res_M).filter(isNum);
  const rms = epochs.map(e => e.RMSSD).filter(isNum);
  return {
    HR_BASE: mean(hr),
    HR_LOW: percentile(hr, 25),
    HR_HIGH: percentile(hr, 75),
    RR_BASE: mean(rr),
    RMSSD_BASE: rms.length ? percentile(rms, 50) : null,   // night median RMSSD (ms)
  };
}

/* --------------------------------------------------------- 4. classify ---- */
function classify(epochs, b) {
  let firstAwakeSeen = false;
  for (let i = 0; i < epochs.length; i++) {
    const e = epochs[i];
    const hr = e.HR_M, rr = e.Res_M, hsd = e.HR_SD_5M, rsd = e.RR_SD_5M;
    const st = (isNum(hsd) && hsd < 2) ? 1 : (isNum(hsd) && hsd < 4) ? 2 : 3; // HR_Stability

    // HR rise vs the previous 2 epochs (bpm); optional RMSSD drop vs baseline.
    const prev2 = epochs.slice(Math.max(0, i - 2), i).map(x => x.HR_M).filter(isNum);
    const hrRise1m = (prev2.length && isNum(hr)) ? hr - mean(prev2) : null;
    const rmsLow = isNum(e.RMSSD) && isNum(b.RMSSD_BASE) &&
                   e.RMSSD < CFG.RMSSD_AWAKE_FRAC * b.RMSSD_BASE;

    // AWAKE (spec 7/12): movement ALONE is NOT Awake. Strong physiological
    // evidence scores Awake with no movement; movement scores Awake only within
    // MOVEMENT_AWAKE_WINDOW_S AND with physiological confirmation.
    const strongAwake =
      (isNum(hr)  && hr  > b.HR_BASE + 12) ||
      (isNum(rr)  && rr  > b.RR_BASE + 5)  ||
      (isNum(hsd) && hsd >= 6) ||
      (isNum(rsd) && rsd >= 3) ||
      (e.SN_B === 1 && st === 3);
    const movementAwake =
      e.T_LAST_TURN <= CFG.MOVEMENT_AWAKE_WINDOW_S && (
        (isNum(hr)  && hr  > b.HR_BASE + 8) ||
        (isNum(hrRise1m) && hrRise1m >= CFG.HR_RISE_AWAKE_BPM) ||
        (isNum(rr)  && rr  > b.RR_BASE + 5) ||
        (isNum(hsd) && hsd >= 6) ||
        (isNum(rsd) && rsd >= 3) ||
        rmsLow
      );
    if (strongAwake || movementAwake) { e.stage = 'Awake'; firstAwakeSeen = true; continue; }

    const deep =
      e.T_LAST_TURN > 600 &&
      isNum(hr) && hr <= b.HR_LOW + 6 &&
      isNum(hsd) && hsd < 3 &&
      isNum(rr) && rr <= b.RR_BASE + 1 &&
      isNum(rsd) && rsd < 1.2 &&
      !rmsLow;                          // Deep needs high parasympathetic tone:
                                        // veto if RMSSD is clearly below baseline.
    if (deep) { e.stage = 'Deep'; continue; }

    const rem =
      firstAwakeSeen &&
      e.T_LAST_TURN > 300 &&
      isNum(hr) && hr > b.HR_LOW + 4 && hr <= b.HR_BASE + 12 &&
      // Autonomic variability, from HR/RR SD OR an RMSSD drop (sympathetic).
      ((isNum(hsd) && hsd >= 2) || (isNum(rsd) && rsd >= 1) || rmsLow) &&
      e.MS_B === 0;
    e.stage = rem ? 'REM' : 'Light';
  }
}

/* ------------------------------------------------ 5. REM gate + smoothing -- */
function remGate(epochs) {                    // REM before first Awake -> Light
  let firstAwake = epochs.findIndex(e => e.stage === 'Awake');
  if (firstAwake < 0) firstAwake = epochs.length;
  for (let i = 0; i < firstAwake; i++) if (epochs[i].stage === 'REM') epochs[i].stage = 'Light';
}
function smoothRuns(epochs) {                  // short Deep/REM runs -> Light
  let i = 0;
  while (i < epochs.length) {
    let j = i;
    while (j < epochs.length && epochs[j].stage === epochs[i].stage) j++;
    const len = j - i, st = epochs[i].stage;
    if ((st === 'Deep' && len < CFG.DEEP_MIN_EPOCHS) ||
        (st === 'REM' && len < CFG.REM_MIN_EPOCHS)) {
      for (let k = i; k < j; k++) epochs[k].stage = 'Light';
    }
    i = j;
  }
}
// Arousal debounce: short Awake runs AFTER sleep onset -> Light. Disabled when
// AWAKE_MIN_EPOCHS <= 1 (raw workbook). Keeps efficiency/WASO/awakenings sane.
function smoothAwake(epochs) {
  if (CFG.AWAKE_MIN_EPOCHS <= 1) return;
  const onset = epochs.findIndex(e => e.stage !== 'Awake');
  if (onset < 0) return;
  let i = onset;
  while (i < epochs.length) {
    if (epochs[i].stage !== 'Awake') { i++; continue; }
    let j = i;
    while (j < epochs.length && epochs[j].stage === 'Awake') j++;
    if (j - i < CFG.AWAKE_MIN_EPOCHS) {
      for (let k = i; k < j; k++) epochs[k].stage = 'Light';
    }
    i = j;
  }
}

/* ---------------------------------------------------------- 6. metrics ---- */
function metrics(epochs) {
  const N = epochs.length;
  const min = 0.5;                            // minutes per epoch
  const onset = epochs.findIndex(e => e.stage !== 'Awake');
  const onsetIdx = onset < 0 ? N : onset;

  const awakeE = epochs.filter(e => e.stage === 'Awake').length;   // ALL wake epochs
  const deepE = epochs.filter(e => e.stage === 'Deep').length;
  const remE = epochs.filter(e => e.stage === 'REM').length;

  const recordingMin = N * min;                 // time in bed
  const wakeMin = awakeE * min;                 // wake to SUBTRACT (SOL + WASO + terminal)
  const sleepMin = recordingMin - wakeMin;      // <-- wake subtracted = time asleep
  const deepMin = deepE * min;
  const remMin = remE * min;
  const deepPct = sleepMin ? (deepMin / sleepMin) * 100 : 0;
  const remPct = sleepMin ? (remMin / sleepMin) * 100 : 0;

  let wasoE = 0, awakenings = 0, prevAwake = false;
  for (let i = onsetIdx; i < N; i++) {
    const aw = epochs[i].stage === 'Awake';
    if (aw) { wasoE++; if (!prevAwake) awakenings++; }
    prevAwake = aw;
  }
  const WASOmin = wasoE * min;
  // Efficiency = time asleep / time in bed = (recording - wake) / recording.
  const efficiency = recordingMin ? (sleepMin / recordingMin) * 100 : 0;

  // Recovery adjustment from HRV (extension beyond the base spec): higher sleeping
  // RMSSD = better parasympathetic recovery. Absolute log-map 20..70 ms -> 0..1,
  // centred at 0.5, scaled to a small bounded nudge (± CFG.RMSSD_SCORE_PTS).
  // No-op if RMSSD was never present in the night.
  const rmsVals = epochs.map(e => e.RMSSD).filter(isNum);
  let rmssdMed = null, rmssdAdj = 0;
  if (rmsVals.length) {
    rmssdMed = percentile(rmsVals, 50);
    const f = clamp((Math.log(rmssdMed) - Math.log(20)) /
                    (Math.log(70) - Math.log(20)), 0, 1);
    rmssdAdj = (f - 0.5) * 2 * CFG.RMSSD_SCORE_PTS;
  }

  const score = clamp(
    100
    - Math.max(0, 85 - efficiency)
    - Math.max(0, 15 - deepPct) * 0.7
    - Math.max(0, 10 - remPct) * 0.5
    - Math.max(0, WASOmin - 30) * 0.25
    - awakenings * 1.5
    + rmssdAdj, 0, 100);

  const scoreR = Math.round(score);
  const q = qualityFor(scoreR);

  return {
    recordingMin, wakeMin, sleepMin,
    deepMin: +deepMin.toFixed(1), remMin: +remMin.toFixed(1),
    deepPct: +deepPct.toFixed(1), remPct: +remPct.toFixed(1),
    WASOmin, awakenings, efficiency: +efficiency.toFixed(1),
    recoveryPct: +(deepPct + remPct).toFixed(1),
    rmssdMedian: rmssdMed == null ? null : +rmssdMed.toFixed(1),
    score: scoreR, label: q.label, msg: q.msg,
  };
}

/* -------------------------------------------------------- 7. hypnogram ---- */
const STAGE_Y = { Awake: 3, REM: 2, Light: 1, Deep: 0 };
function hypnogram(epochs) {
  return epochs.map(e => ({ t: e.t, stage: e.stage, y: STAGE_Y[e.stage] }));
}

/* ------------------------------------------------------------- main -------- */
function analyseNight(epochs) {
  derive(epochs);
  const baselines = nightBaselines(epochs);
  classify(epochs, baselines);
  remGate(epochs);       // pre
  smoothRuns(epochs);    // short Deep/REM -> Light
  smoothAwake(epochs);   // short Awake (arousals) -> Light  (tunable, see CFG)
  remGate(epochs);       // post
  return { epochs, baselines, hypnogram: hypnogram(epochs), metrics: metrics(epochs) };
}

const SleepAlgo = {
  collectEpochs, analyseNight, nightBaselines, metrics, hypnogram,
  qualityFor, QUALITY_TABLE, CFG,
};
if (typeof module !== 'undefined' && module.exports) module.exports = SleepAlgo;

/* --------------------------------------------------------------- demo ------ */
if (typeof require !== 'undefined' && require.main === module) {
  // Synthetic ~8 h night (960 epochs). Windows are laid out to exercise every
  // stage; proportions are illustrative, NOT physiological.
  const epochs = [];
  const start = 1751000000;              // arbitrary unix start (no Date needed)
  let lastMST = null;
  const deepWin = (i) => (i >= 60 && i < 110) || (i >= 210 && i < 255) || (i >= 640 && i < 690);
  const wakeWin = (i) => (i >= 420 && i < 445) || (i >= 560 && i < 570);
  const remWin  = (i) => (i >= 470 && i < 535) || (i >= 720 && i < 770);   // after first wake
  for (let i = 0; i < 960; i++) {
    const t = start + i * 30;
    let hr = 55, rr = 14, mv = 0;
    if (wakeWin(i))      { hr = 71; mv = 1; lastMST = t; }             // Awake
    else if (deepWin(i)) { hr = 49; rr = 13; }                        // still + low HR -> Deep
    else if (remWin(i))  { hr = 63 + ((i % 3) - 1) * 3; rr = 16; }    // higher/variable -> REM
    else { hr = 55; if (i % 20 === 0 && i > 0) { mv = 1; lastMST = t; } } // Light + periodic turns
    hr += (i % 5) - 2;                                                 // small jitter
    epochs.push({
      t, HR_M: hr, Res_M: rr, HR_SD_5M: null, RR_SD_5M: null,
      MS_B: mv, SN_B: 0, lastMST,
    });
  }
  const r = analyseNight(epochs);
  console.log('Baselines:', {
    HR_BASE: +r.baselines.HR_BASE.toFixed(1), HR_LOW: +r.baselines.HR_LOW.toFixed(1),
    HR_HIGH: +r.baselines.HR_HIGH.toFixed(1), RR_BASE: +r.baselines.RR_BASE.toFixed(1),
  });
  console.log('Metrics:', r.metrics);
  const counts = r.epochs.reduce((a, e) => (a[e.stage] = (a[e.stage] || 0) + 1, a), {});
  console.log('Stage epochs:', counts);
}
