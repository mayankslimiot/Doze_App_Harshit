/**
 * Sleep Stage Classification Service
 * Implements the algorithm from: docs/SLEEP_ALGORITHM.md (Clean Version spec)
 *
 * Two-pass approach:
 *   Pass 1: Collect all epochs within the sleep session, compute full-night baselines
 *   Pass 2: Classify each epoch, apply REM gate + smoothing + awake debounce
 *
 * This service classifies each 30-sec epoch into one of:
 *   AWAKE | LIGHT | DEEP | REM
 *
 * SAFEGUARD (dual-condition field reading):
 *   - Reads from BOTH raw.HR_M (old data, before backend deploy) AND
 *     mapped schema fields e.g. heartRateMedian/heartRate (post-deploy).
 *   - Whichever is available and valid wins.
 */

const { logger } = require('../utils/logger');

// ---------------------------------------------------------------------------
// Configuration (matches sleep_algorithm.js CFG)
// ---------------------------------------------------------------------------
const CFG = {
  EPOCH_SEC: 30,             // one epoch = 30 s = 0.5 min
  DEEP_MIN_EPOCHS: 10,      // Deep run < 10 epochs (5 min) -> Light
  REM_MIN_EPOCHS: 6,        // REM  run <  6 epochs (3 min) -> Light
  AWAKE_MIN_EPOCHS: 4,      // < 4 epochs (< 2 min) after onset -> arousal -> Light
                             // Per SLEEP_ALGORITHM_UPDATED_AWAKE_RULES.md.
  NO_MST: 99999,            // T_LAST_TURN when no MST yet
  SD_MIN: 3,                // min medians for a valid rolling SD (fallback calc)
  // Awake rules (spec 7/12): movement ALONE is NOT Awake. Movement counts toward
  // Awake only within MOVEMENT_AWAKE_WINDOW_S AND with physiological confirmation
  // (HR/RR up, HR rise, HR/RR instability, or an RMSSD drop).
  MOVEMENT_AWAKE_WINDOW_S: 60,  // s: movement is an arousal candidate only within this
  HR_RISE_AWAKE_BPM: 5,         // HR_M rise vs mean of previous 2 epochs => arousal
  // RMSSD < FRAC*baseline = "clearly below the night median". Used for the
  // movement-Awake confirmation AND as the Deep veto / REM support.
  RMSSD_AWAKE_FRAC: 0.85,   // RMSSD < FRAC*baseline => veto Deep, support REM, confirm movement-Awake
  RMSSD_SCORE_PTS:  1.5,    // max ± recovery-score points from sleeping RMSSD
};

// Sleep quality rating table (§10)
const QUALITY_TABLE = [
  { range: '>85', test: (s) => s > 85, label: 'Excellent', msg: 'Very good sleep quality' },
  { range: '70-85', test: (s) => s >= 70 && s <= 85, label: 'Good', msg: 'Good sleep quality' },
  { range: '55-70', test: (s) => s >= 55 && s < 70, label: 'Fair', msg: 'Average or disturbed sleep' },
  { range: '<55', test: (s) => s < 55, label: 'Poor', msg: 'Poor sleep quality' },
];

function qualityFor(score) {
  return QUALITY_TABLE.find((q) => q.test(score)) || QUALITY_TABLE[QUALITY_TABLE.length - 1];
}

// ---------------------------------------------------------------------------
// Helpers: safe parsers (kept from original)
// ---------------------------------------------------------------------------
function parseFloat_(val, defaultVal = null) {
  if (val === null || val === undefined || val === '') return defaultVal;
  const n = Number(val);
  return Number.isFinite(n) ? n : defaultVal;
}

function parseInt_(val, defaultVal = 0) {
  if (val === null || val === undefined || val === '') return defaultVal;
  const n = parseInt(val, 10);
  return Number.isFinite(n) ? n : defaultVal;
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// ---------------------------------------------------------------------------
// Math helpers (from sleep_algorithm.js reference)
// ---------------------------------------------------------------------------
function mean(a) {
  return a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
}

function stddevPop(a) {
  if (a.length < 1) return null;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / a.length);
}

function percentile(a, p) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const rank = (p / 100) * (s.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  return lo === hi ? s[lo] : s[lo] + (rank - lo) * (s[hi] - s[lo]);
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ---------------------------------------------------------------------------
// DUAL SAFEGUARD: read epoch fields from a HealthData document
//   First tries the mapped schema field, then falls back to raw.* fields
// ---------------------------------------------------------------------------
function readEpochFields(point) {
  const raw = point.raw || {};

  // HR median (30-sec epoch) — mapped: metrics.hr_median or heartRate(schema field) OR raw.HR_M
  const hrMapped = parseFloat_(point.metrics?.hr_median) ?? parseFloat_(point.heartRate);
  const hrRaw = parseFloat_(raw.HR_M);
  const hr = (hrMapped !== null && hrMapped > 0) ? hrMapped : hrRaw;

  // Respiration median — mapped: metrics.respirationMedian OR raw.Res_M
  const rrMapped = parseFloat_(point.metrics?.respirationMedian) ?? parseFloat_(point.respiration);
  const rrRaw = parseFloat_(raw.Res_M);
  const rr = (rrMapped !== null && rrMapped > 0) ? rrMapped : rrRaw;

  // HR SD over 5 min — mapped: metrics.heartRateSD OR raw.HR_SD
  // §4: firmware now sends rolling SD of last 10 HR_M — read directly as HR_SD_5M
  const hrSdMapped = parseFloat_(point.metrics?.heartRateSD);
  const hrSdRaw = parseFloat_(raw.HR_SD);
  const hr_sd = hrSdMapped !== null ? hrSdMapped : hrSdRaw;

  // Respiration SD over 5 min — mapped: metrics.respirationSD OR raw.RESSD
  // §4: firmware now sends rolling SD of last 10 Res_M — read directly as RR_SD_5M
  const rrSdMapped = parseFloat_(point.metrics?.respirationSD);
  const rrSdRaw = parseFloat_(raw.RESSD);
  const rr_sd = rrSdMapped !== null ? rrSdMapped : rrSdRaw;

  // Snore boolean — mapped: snoreDetected OR raw.SN_B
  const snoreMapped = parseInt_(point.snoreDetected, null);
  const snoreRaw = parseInt_(raw.SN_B, null);
  const snore = snoreMapped !== null ? snoreMapped : (snoreRaw !== null ? snoreRaw : 0);

  // Motion start / stop timestamps for T_LAST_TURN — mapped schema fields OR raw.MS / raw.MST
  const ms = parseFloat_(point.motionStart) ?? parseFloat_(raw.MS);
  const mst = parseFloat_(point.motionStop) ?? parseFloat_(raw.MST);

  // Motion boolean — derived from motionBoolean field, raw.MS_B, or motionStart presence
  const msBoolMapped = parseInt_(point.motionBoolean, null);
  const msBoolRaw = parseInt_(raw.MS_B, null);
  const ms_b = msBoolMapped !== null ? (msBoolMapped > 0 ? 1 : 0)
    : msBoolRaw !== null ? (msBoolRaw > 0 ? 1 : 0)
      : (ms !== null && ms > 0) ? 1 : 0;

  // Absence/presence — mapped: absenceStart (1 = present) OR raw.AS
  const asMapped = parseInt_(point.absenceStart, null);
  const asRaw = parseInt_(raw.AS, null);
  const as = asMapped !== null ? asMapped : (asRaw !== null ? asRaw : null);

  // Epoch timestamp (seconds) — mapped: timestampSeconds OR raw.TS
  const tsMapped = parseFloat_(point.timestampSeconds);
  const tsRaw = parseFloat_(raw.TS);
  const ts = tsMapped !== null ? tsMapped : tsRaw;

  // HRV RMSSD (ms) — from raw.RMSSD (JSON6 field). May be null/missing.
  const rmssdMapped = parseFloat_(point.metrics?.rmssd);
  const rmssdRaw    = parseFloat_(raw.RMSSD);
  const rmssd       = rmssdMapped !== null ? rmssdMapped : rmssdRaw;

  return { hr, rr, hr_sd, rr_sd, snore, ms, mst, ms_b, as, ts, rmssd };
}

// ---------------------------------------------------------------------------
// §5 Night Baselines (two-pass — compute over the WHOLE night, then classify)
// ---------------------------------------------------------------------------
function nightBaselines(epochs) {
  const hr  = epochs.map(e => e.hr).filter(isNum);
  const rr  = epochs.map(e => e.rr).filter(isNum);
  const rms = epochs.map(e => e.rmssd).filter(isNum);
  return {
    HR_BASE:    mean(hr),
    HR_LOW:     percentile(hr, 25),
    HR_HIGH:    percentile(hr, 75),
    RR_BASE:    mean(rr),
    RMSSD_BASE: rms.length ? percentile(rms, 50) : null,  // night median RMSSD (ms)
  };
}

// ---------------------------------------------------------------------------
// §7 Per-epoch Classification (evaluate in priority order)
// ---------------------------------------------------------------------------
function classify(epochs, b) {
  let firstAwakeSeen = false;
  for (let idx = 0; idx < epochs.length; idx++) {
    const e = epochs[idx];
    const hr = e.hr, rr = e.rr, hsd = e.hr_sd_5m, rsd = e.rr_sd_5m;
    const hrStability = (isNum(hsd) && hsd < 2) ? 1 : (isNum(hsd) && hsd < 4) ? 2 : 3;
    e.hr_stability = hrStability;

    // Compute HR_State for DB/logging
    if (isNum(hr) && isNum(b.HR_BASE)) {
      if (hr <= b.HR_LOW + 3) e.hr_state = 1;
      else if (hr <= b.HR_LOW + 6) e.hr_state = 2;
      else if (hr <= b.HR_BASE + 5) e.hr_state = 3;
      else if (hr <= b.HR_BASE + 12) e.hr_state = 4;
      else e.hr_state = 5;
    }

    // Compute Resp_State for DB/logging
    if (isNum(rr) && isNum(b.RR_BASE)) {
      if (rr <= b.RR_BASE - 2) e.resp_state = 1;
      else if (rr <= b.RR_BASE + 2) e.resp_state = 2;
      else if (rr <= b.RR_BASE + 5) e.resp_state = 3;
      else e.resp_state = 4;
    }

    // RMSSD "clearly below the night median" = autonomic sympathetic shift.
    // No-op when either the per-epoch value OR the baseline is absent.
    const rms    = e.rmssd;
    const rmsLow = isNum(rms) && isNum(b.RMSSD_BASE) &&
                   rms < CFG.RMSSD_AWAKE_FRAC * b.RMSSD_BASE;

    // HR rise vs the previous 2 epochs (bpm) — new movement-Awake confirmation.
    const prev2 = epochs.slice(Math.max(0, idx - 2), idx).map(x => x.hr).filter(isNum);
    const hrRise1m = (prev2.length && isNum(hr)) ? hr - mean(prev2) : null;

    // §7 AWAKE — split into strongAwake (no movement needed) and movementAwake
    // (movement + physiological confirmation). Movement alone is NOT Awake.
    const strongAwake =
      (isNum(hr)  && hr  > b.HR_BASE + 12) ||
      (isNum(rr)  && rr  > b.RR_BASE + 5)  ||
      (isNum(hsd) && hsd >= 6) ||
      (isNum(rsd) && rsd >= 3) ||
      (e.snore === 1 && hrStability === 3);
    const movementAwake =
      e.tLastTurn <= CFG.MOVEMENT_AWAKE_WINDOW_S && (
        (isNum(hr)  && hr  > b.HR_BASE + 8) ||
        (isNum(hrRise1m) && hrRise1m >= CFG.HR_RISE_AWAKE_BPM) ||
        (isNum(rr)  && rr  > b.RR_BASE + 5) ||
        (isNum(hsd) && hsd >= 6) ||
        (isNum(rsd) && rsd >= 3) ||
        rmsLow
      );
    if (strongAwake || movementAwake) { e.stage = 'AWAKE'; e.rawStage = 'AWAKE'; firstAwakeSeen = true; continue; }

    // §7 DEEP — if all conditions
    // !rmsLow veto: Deep needs high parasympathetic tone (high RMSSD).
    // If RMSSD is clearly below the night median, epoch is Light, not Deep.
    const deep =
      e.tLastTurn > 600 &&
      isNum(hr) && hr <= b.HR_LOW + 6 &&
      isNum(hsd) && hsd < 3 &&
      isNum(rr) && rr <= b.RR_BASE + 1 &&
      isNum(rsd) && rsd < 1.2 &&
      !rmsLow;                // RMSSD veto: no-op if RMSSD absent
    if (deep) { e.stage = 'DEEP'; e.rawStage = 'DEEP'; continue; }

    // §7 REM — if all conditions
    // rmsLow added as an extra variability trigger: REM = sympathetic surges
    // = RMSSD drops, even when HR_SD / RR_SD are not elevated.
    const rem =
      firstAwakeSeen &&
      e.tLastTurn > 300 &&
      isNum(hr) && hr > b.HR_LOW + 4 && hr <= b.HR_BASE + 12 &&
      ((isNum(hsd) && hsd >= 2) || (isNum(rsd) && rsd >= 1) || rmsLow) &&
      e.ms_b === 0;
    e.stage = rem ? 'REM' : 'LIGHT';
    e.rawStage = e.stage;
  }
}

// ---------------------------------------------------------------------------
// §8 REM Gate + Smoothing (order matters)
// ---------------------------------------------------------------------------

// Step 1 & 3: REM before first Awake → Light
function remGate(epochs) {
  let firstAwake = epochs.findIndex(e => e.stage === 'AWAKE');
  if (firstAwake < 0) firstAwake = epochs.length;
  for (let i = 0; i < firstAwake; i++) {
    if (epochs[i].stage === 'REM') epochs[i].stage = 'LIGHT';
  }
}

// Step 2: Short Deep/REM runs → Light
function smoothRuns(epochs) {
  let i = 0;
  while (i < epochs.length) {
    let j = i;
    while (j < epochs.length && epochs[j].stage === epochs[i].stage) j++;
    const len = j - i;
    const st = epochs[i].stage;
    if ((st === 'DEEP' && len < CFG.DEEP_MIN_EPOCHS) ||
      (st === 'REM' && len < CFG.REM_MIN_EPOCHS)) {
      for (let k = i; k < j; k++) epochs[k].stage = 'LIGHT';
    }
    i = j;
  }
}

// Step 2b: Arousal debounce — short Awake runs AFTER sleep onset → Light
function smoothAwake(epochs) {
  if (CFG.AWAKE_MIN_EPOCHS <= 1) return;
  const onset = epochs.findIndex(e => e.stage !== 'AWAKE');
  if (onset < 0) return;
  let i = onset;
  while (i < epochs.length) {
    if (epochs[i].stage !== 'AWAKE') { i++; continue; }
    let j = i;
    while (j < epochs.length && epochs[j].stage === 'AWAKE') j++;
    if (j - i < CFG.AWAKE_MIN_EPOCHS) {
      for (let k = i; k < j; k++) epochs[k].stage = 'LIGHT';
    }
    i = j;
  }
}

// ---------------------------------------------------------------------------
// Main Classification Pipeline (two-pass)
// ---------------------------------------------------------------------------

/**
 * Classify sleep stages from an array of HealthData documents.
 *
 * @param {Array}  healthDataPoints  - Mongoose docs or plain objects from HealthData collection
 * @param {Date|number} sleepOnsetTime  - When sleep was confirmed (from sleepAnalyticsService)
 * @param {Date|number} sleepEndTime    - When sleep ended
 * @returns {{ timeline: Array, summary: Object }}
 */
function classifySleepStages(healthDataPoints, sleepOnsetTime, sleepEndTime) {
  if (!healthDataPoints || healthDataPoints.length === 0) {
    return { timeline: [], summary: buildEmptySummary() };
  }

  const onsetMs = sleepOnsetTime instanceof Date ? sleepOnsetTime.getTime() : Number(sleepOnsetTime);
  const endMs = sleepEndTime instanceof Date ? sleepEndTime.getTime() : Number(sleepEndTime);

  // Sort points oldest-first
  const sorted = [...healthDataPoints].sort((a, b) => {
    const ta = a.timestampSeconds || (new Date(a.timestamp).getTime() / 1000);
    const tb = b.timestampSeconds || (new Date(b.timestamp).getTime() / 1000);
    return ta - tb;
  });

  // ── PASS 1: Collect all valid epochs ──────────────────────────────────────
  const epochs = [];
  let lastMST = null;
  let lastAcceptedTs = 0; // Tracks the last accepted epoch timestamp to filter 6s duplicates

  // Fallback rolling SD buffers (in case firmware doesn't send HR_SD/RESSD)
  const hrHist = [];
  const rrHist = [];

  for (const point of sorted) {
    const fields = readEpochFields(point);

    // Gate: AS must be 1 (person present) and must have HR_M and Res_M
    if (fields.as !== 1) continue;
    if (fields.hr === null || fields.rr === null) continue;

    const pointMs = fields.ts !== null ? fields.ts * 1000 : new Date(point.timestamp).getTime();

    // Only classify epochs within the sleep session
    if (pointMs < onsetMs || pointMs > endMs) continue;

    const ts = fields.ts !== null ? fields.ts : pointMs / 1000;

    // § Deduplication: reject records that arrive < 25s after the last accepted epoch.
    // This safely drops the 6s duplicates sent by newer firmware without MS_B.
    if (ts - lastAcceptedTs < 25) continue;
    lastAcceptedTs = ts;

    // §6: Update lastMST (motion stop) tracker for T_LAST_TURN
    const mst = (fields.mst !== null && fields.mst > 0) ? fields.mst : null;
    const ms = (fields.ms !== null && fields.ms > 0) ? fields.ms : null;
    if (mst !== null) {
      lastMST = mst;
    } else if (ms !== null) {
      lastMST = ms;
    }

    // Parse values
    const hr    = parseFloat_(fields.hr);
    const rr    = parseFloat_(fields.rr);
    let   hrSd  = fields.hr_sd !== null ? parseFloat_(fields.hr_sd) : null;
    let   rrSd  = fields.rr_sd !== null ? parseFloat_(fields.rr_sd) : null;
    const snore = fields.snore || 0;
    const ms_b  = fields.ms_b  || 0;
    const rmssd = fields.rmssd !== null ? parseFloat_(fields.rmssd) : null;  // HRV ms

    // §4: HR_SD_5M / RR_SD_5M come from firmware. Fallback: compute rolling
    // if the firmware field is missing (keeps this correct on partial data).
    if (isNum(hr)) { hrHist.push(hr); if (hrHist.length > 10) hrHist.shift(); }
    if (isNum(rr)) { rrHist.push(rr); if (rrHist.length > 10) rrHist.shift(); }
    if (!isNum(hrSd)) hrSd = hrHist.length >= CFG.SD_MIN ? stddevPop([...hrHist]) : null;
    if (!isNum(rrSd)) rrSd = rrHist.length >= CFG.SD_MIN ? stddevPop([...rrHist]) : null;

    // §6: T_LAST_TURN
    const tLastTurn = isNum(lastMST) ? (ts - lastMST) : CFG.NO_MST;

    epochs.push({
      ts,
      hr,
      rr,
      hr_sd_5m: hrSd,
      rr_sd_5m: rrSd,
      rmssd,
      snore,
      ms_b,
      tLastTurn,
      stage: null,   // filled in pass 2
      rawStage: null,   // filled in pass 2
      hr_state: 0,
      resp_state: 0,
      hr_stability: 0,
    });
  }

  if (epochs.length === 0) {
    return { timeline: [], summary: buildEmptySummary() };
  }

  // ── PASS 2: Compute baselines over ALL epochs, then classify ──────────────
  const baselines = nightBaselines(epochs);

  logger.info('[SleepStage] Night baselines computed (two-pass)', {
    HR_BASE: baselines.HR_BASE?.toFixed(1),
    HR_LOW: baselines.HR_LOW?.toFixed(1),
    HR_HIGH: baselines.HR_HIGH?.toFixed(1),
    RR_BASE: baselines.RR_BASE?.toFixed(1),
    epochCount: epochs.length,
  });

  // §7: classify every epoch
  classify(epochs, baselines);

  // §8: REM gate + smoothing (order matters)
  remGate(epochs);           // step 1: pre — REM before first Awake → Light
  smoothRuns(epochs);        // step 2: short Deep/REM runs → Light
  smoothAwake(epochs);       // step 2b: short Awake runs (arousals) → Light
  remGate(epochs);           // step 3: post — re-apply after smoothing

  // Build timeline output (same format as before for backward compatibility)
  const timeline = epochs.map(e => ({
    ts:           e.ts,
    stage:        e.stage,
    rawStage:     e.rawStage,
    hr:           e.hr,
    rr:           e.rr,
    hr_sd_5m:     e.hr_sd_5m,
    rr_sd_5m:     e.rr_sd_5m,
    rmssd:        e.rmssd,
    tLastTurn:    e.tLastTurn,
    hr_state:     e.hr_state,
    resp_state:   e.resp_state,
    hr_stability: e.hr_stability,
  }));

  const summary = buildSummary(timeline);

  logger.info('[SleepStage] Classification complete', {
    epochsClassified: timeline.length,
    deepSleepMinutes: summary.deepSleepMinutes,
    remMinutes: summary.remMinutes,
    lightSleepMinutes: summary.lightSleepMinutes,
    awakeMinutes: summary.awakeMinutes,
    recoveryPercent: summary.recoveryPercent,
    sleepScore: summary.sleepScore,
    sleepQuality: summary.sleepQuality,
    efficiency: summary.efficiency,
    awakenings: summary.awakenings,
  });

  return { timeline, summary };
}

// ---------------------------------------------------------------------------
// §10 Summary, Metrics & Score (from the FINAL smoothed stage series)
// ---------------------------------------------------------------------------
function buildSummary(timeline) {
  const N = timeline.length;
  const EPOCH_MIN = 0.5; // 30-sec epoch = 0.5 min

  let awakeCount = 0, deepCount = 0, remCount = 0, lightCount = 0;
  for (const e of timeline) {
    switch (e.stage) {
      case 'AWAKE': awakeCount++; break;
      case 'DEEP': deepCount++; break;
      case 'REM': remCount++; break;
      default: lightCount++; break;
    }
  }

  const recordingMin = N * EPOCH_MIN;                   // time in bed
  const wakeMin = awakeCount * EPOCH_MIN;          // ALL wake (SOL + WASO + terminal)
  const sleepMin = recordingMin - wakeMin;          // wake subtracted = time asleep
  const deepMin = deepCount * EPOCH_MIN;
  const remMin = remCount * EPOCH_MIN;
  const lightMin = lightCount * EPOCH_MIN;
  const deepPct = sleepMin > 0 ? (deepMin / sleepMin) * 100 : 0;
  const remPct = sleepMin > 0 ? (remMin / sleepMin) * 100 : 0;

  // Sleep onset index = first non-Awake epoch
  const onsetIdx = timeline.findIndex(e => e.stage !== 'AWAKE');
  const onsetIndex = onsetIdx < 0 ? N : onsetIdx;

  // WASO and awakenings (from smoothed stage series, AFTER onset)
  // Per SLEEP_ALGORITHM_UPDATED_AWAKE_RULES.md §10: count only Awake runs
  // that are >= AWAKE_MIN_EPOCHS (4 epochs = 2 min) as true awakenings.
  let wasoEpochs = 0, awakenings = 0;
  let i_aw = onsetIndex;
  while (i_aw < N) {
    if (timeline[i_aw].stage !== 'AWAKE') { i_aw++; continue; }
    // Start of an Awake run — count its length
    let j_aw = i_aw;
    while (j_aw < N && timeline[j_aw].stage === 'AWAKE') j_aw++;
    const runLen = j_aw - i_aw;
    wasoEpochs += runLen;
    if (runLen >= CFG.AWAKE_MIN_EPOCHS) awakenings++;
    i_aw = j_aw;
  }
  const WASOmin = wasoEpochs * EPOCH_MIN;

  // Efficiency = sleepMinutes / recordingMinutes (stage-based, §10)
  const efficiency = recordingMin > 0 ? (sleepMin / recordingMin) * 100 : 0;

  // Recovery % = Deep% + REM% (share of sleep)
  const recoveryPct = sleepMin > 0 ? ((deepMin + remMin) / sleepMin) * 100 : 0;

  // §10 Sleep score (penalty model; clamp 0–100, round)
  const efficiencyPenalty = Math.max(0, 85 - efficiency);
  const deepPenalty       = Math.max(0, 15 - deepPct) * 0.7;
  const remPenalty        = Math.max(0, 10 - remPct)  * 0.5;
  const wasoPenalty       = Math.max(0, WASOmin - 30)  * 0.25;
  const awakeningPenalty  = awakenings * 1.5;

  // RMSSD recovery bonus (±1.5 pts max). Higher sleeping RMSSD = better
  // parasympathetic recovery. Log-maps 20–70 ms → 0..1, centred at 0.5.
  // No-op if RMSSD was never present in this night's data.
  const rmsVals = timeline.map(e => e.rmssd).filter(isNum);
  let rmssdMedian = null, rmssdAdj = 0;
  if (rmsVals.length) {
    rmssdMedian = percentile(rmsVals, 50);
    const f = clamp(
      (Math.log(rmssdMedian) - Math.log(20)) / (Math.log(70) - Math.log(20)),
      0, 1
    );
    rmssdAdj = (f - 0.5) * 2 * CFG.RMSSD_SCORE_PTS;   // ± CFG.RMSSD_SCORE_PTS
  }

  const score = Math.round(clamp(
    100 - efficiencyPenalty - deepPenalty - remPenalty - wasoPenalty - awakeningPenalty
        + rmssdAdj,
    0, 100
  ));

  const quality = qualityFor(score);

  return {
    // Backward-compatible fields (same names as before)
    deepSleepMinutes:  Math.round(deepMin  * 10) / 10,
    remMinutes:        Math.round(remMin   * 10) / 10,
    lightSleepMinutes: Math.round(lightMin * 10) / 10,
    awakeMinutes:      Math.round(wakeMin  * 10) / 10,
    recoveryPercent:   Math.round(recoveryPct * 10) / 10,
    totalEpochs:       N,
    // New fields from the spec
    recordingMinutes:  Math.round(recordingMin * 10) / 10,
    sleepMinutes:      Math.round(sleepMin * 10) / 10,
    deepPct:           Math.round(deepPct  * 10) / 10,
    remPct:            Math.round(remPct   * 10) / 10,
    WASOmin:           Math.round(WASOmin  * 10) / 10,
    awakenings,
    efficiency:        Math.round(efficiency * 10) / 10,
    sleepScore:        score,
    sleepQuality:      quality.label,
    sleepQualityMsg:   quality.msg,
    rmssdMedian:       rmssdMedian !== null ? Math.round(rmssdMedian * 10) / 10 : null,
  };
}

function buildEmptySummary() {
  return {
    deepSleepMinutes:  0,
    remMinutes:        0,
    lightSleepMinutes: 0,
    awakeMinutes:      0,
    recoveryPercent:   0,
    totalEpochs:       0,
    recordingMinutes:  0,
    sleepMinutes:      0,
    deepPct:           0,
    remPct:            0,
    WASOmin:           0,
    awakenings:        0,
    efficiency:        0,
    sleepScore:        0,
    sleepQuality:      'Poor',
    sleepQualityMsg:   'Poor sleep quality',
    rmssdMedian:       null,
  };
}

module.exports = {
  classifySleepStages,
  readEpochFields,    // exported for testing
  buildEmptySummary,
};
