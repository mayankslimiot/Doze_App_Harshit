# Dozemate Sleep Algorithm — App/Server Implementation Spec

Authoritative sleep staging, hypnogram, metrics and score run in the **app/server**,
not on the device. The firmware streams **raw per-30-second-epoch features** over
JSON6; the app derives everything else.

This document is the single source of truth for the app team. It matches the
"Dozemate Sleep Algorithm, Clean Version" workbook.

---

## 1. Data flow

```
  Device (firmware)                        App / Server
  ─────────────────                        ─────────────────────────────
  per 30 s epoch  ──JSON6──▶  buffer epochs
    HR_M, Res_M                 ├─ rolling HR_SD_5M / RR_SD_5M   (§4)
    MS_B, SN_B                  ├─ night baselines               (§5)
    MS, MST (timestamps)        ├─ T_LAST_TURN                   (§6)
    (MS_I, RMSSD optional)      ├─ classify each epoch           (§7)
                                ├─ REM gate + smoothing          (§8)
                                ├─ hypnogram graph               (§9)
                                └─ metrics + score + label       (§10)
```

**Epoch = 30 s. One epoch = 0.5 min.**

---

## 2. What the firmware sends (JSON6) — the ONLY device inputs

Each 6 s record carries the fields below. Epoch metrics (HR_M, Res_M, MS_B, SN_B,
MS_I) are emitted **once per 30 s epoch** (blank on the four intervening records);
take the populated one as that epoch's value.

| JSON key | Use in the algorithm |
|---|---|
| `HR_M`   | epoch median heart rate (bpm) — **primary input** |
| `Res_M`  | epoch median respiration (brpm) — **primary input** |
| `HR_SD`  | **rolling** SD of last 10 `HR_M` (5 min) → use directly as `HR_SD_5M` |
| `RESSD`  | **rolling** SD of last 10 `Res_M` (5 min) → use directly as `RR_SD_5M` |
| `MS_B`   | motion-in-epoch flag 0/1 |
| `MS_I`   | *(optional)* graded motion intensity 0–255 — better than MS_B for arousal |
| `SN_B`   | snore detected in epoch 0/1 |
| `MS`,`MST` | movement start / stop epoch timestamps → source for `T_LAST_TURN` |
| `RMSSD`  | latest HRV RMSSD (ms), held between blocks — Awake conf. + Deep/REM/score (§12) |

> The firmware now sends `HR_SD`/`RESSD` as a **rolling** SD of the last 10
> `HR_M`/`Res_M` (recomputed every epoch, valid once ≥3 medians) — **read them
> directly** as `HR_SD_5M`/`RR_SD_5M`; the app no longer needs to compute them.
> Each is blank until ≥3 medians exist (treat blank as "clause false").
> The firmware `HR_BASE/HR_LOW/HR_HIGH/RR_BASE` are **not** sent — the app
> derives them (§5).

---

## 3. Per-epoch record the app builds

For each epoch `i` (in time order) assemble:

```
epoch[i] = {
  t:        epoch start time,
  HR_M:     number | null,     // null if missing this epoch
  Res_M:    number | null,     // ignore 0 -> treat as null
  MS_B:     0 | 1,
  SN_B:     0 | 1,
  T_LAST_TURN: seconds,        // §6
  HR_SD_5M: number | null,     // §4
  RR_SD_5M: number | null,     // §4
  stage:    computed later
}
```

---

## 4. Rolling 5-minute SDs — read from the firmware

`HR_SD_5M` and `RR_SD_5M` come **directly from the JSON6 record** — the firmware
computes them as a rolling population SD of the **last 10** epoch medians
(≈5 min), recomputed every epoch and present once ≥3 medians exist:

```
HR_SD_5M(i) = record.HR_SD     // firmware: SD of last 10 HR_M, >=3 valid
RR_SD_5M(i) = record.RESSD     // firmware: SD of last 10 Res_M, >=3 valid
// blank/absent until >=3 medians -> any rule that reads it -> clause false
```

The app does **not** need its own rolling buffer for these. (Population SD,
divide by N.)

---

## 5. Night baselines (two-pass — compute over the WHOLE night, then classify)

Do **not** compute these progressively/live — that is the main cause of early-night
false Awake. Collect all epochs first, then:

```
HR_BASE = mean(all valid HR_M)
HR_LOW  = 25th percentile(all valid HR_M)     // deep-rest HR
HR_HIGH = 75th percentile(all valid HR_M)
RR_BASE = mean(all valid Res_M)
```

(For a live/streaming view, recompute these on a rolling basis and re-classify;
the final saved night must use the full-night values.)

---

## 6. T_LAST_TURN

`T_LAST_TURN(i)` = seconds between epoch `i` and the **last MST** (motion stop)
timestamp received at or before epoch `i`.

```
if no MST yet:  T_LAST_TURN = 99999
else:           T_LAST_TURN = epoch[i].t - lastMST_time   (seconds)
```

---

## 7. Per-epoch classification (evaluate in this priority order)

Helper states (optional, for readability):
```
HR_State   = HR_M<=HR_LOW+3 ?1 : HR_M<=HR_LOW+6 ?2 : HR_M<=HR_BASE+5 ?3 : HR_M<=HR_BASE+12 ?4 : 5
Resp_State = Res_M<=RR_BASE-2 ?1 : Res_M<=RR_BASE+2 ?2 : Res_M<=RR_BASE+5 ?3 : 4
HR_Stability = HR_SD_5M<2 ?1 : HR_SD_5M<4 ?2 : 3
```

**AWAKE** if any:
```
// Strong physiological Awake evidence — no movement required
HR_M   > HR_BASE+12
OR Res_M  > RR_BASE+5
OR HR_SD_5M >= 6
OR RR_SD_5M >= 3
OR (SN_B==1 AND HR_Stability==3)     // "snore with instability"; tunable

// Movement-based Awake — movement alone is NOT enough
OR (
     T_LAST_TURN <= 60
     AND (
          HR_M > HR_BASE+8
          OR HR_RISE_1M >= 5              // current HR_M - median/mean HR_M of previous 2 epochs
          OR Res_M > RR_BASE+5
          OR HR_SD_5M >= 6
          OR RR_SD_5M >= 3
          OR RMSSD_LOW == true            // optional; true when RMSSD < 0.85 × RMSSD_BASE
     )
   )
```

> **Important:** do **not** classify Awake from `T_LAST_TURN <= 10` alone.
> A normal sleeper turns many times without conscious awakening. Movement is an
> arousal candidate only; it becomes Awake only when accompanied by HR rise, high
> HR/RR, HR/RR instability, or RMSSD drop.

**DEEP** (else) if all:
```
NOT Awake
AND T_LAST_TURN > 600
AND HR_M     <= HR_LOW+6
AND HR_SD_5M < 3
AND Res_M    <= RR_BASE+1
AND RR_SD_5M < 1.2
AND NOT RMSSD_LOW           // (RMSSD extension) Deep needs high parasympathetic
                            // tone; veto if RMSSD clearly below the night median.
                            // No-op when RMSSD is absent.
```

**REM (corrected)** (else) if all:
```
NOT Awake AND NOT Deep
AND remAllowedAfterFirstAwake          // true once the first Awake epoch has occurred
AND T_LAST_TURN > 300
AND HR_M > HR_LOW+4
AND HR_M <= HR_BASE+12
AND (HR_SD_5M >= 2 OR RR_SD_5M >= 1 OR RMSSD_LOW)   // (RMSSD extension) an RMSSD
                                                    // drop = sympathetic/autonomic
                                                    // variability, also supports REM
AND MS_B == 0
```

**LIGHT** — default when not Awake/Deep/REM.

> Clauses that read a `null` SD (fewer than 3 valid values) evaluate to **false**.

---

## 8. REM gate + smoothing (order matters)

```
1. REM gate (pre):   any REM epoch before the first Awake epoch  -> Light
2. Smoothing:
     Deep run  < 10 epochs (< 5 min)  -> whole run becomes Light
     REM  run  <  6 epochs (< 3 min)  -> whole run becomes Light
2b. Arousal debounce (RECOMMENDED — beyond the base workbook):
     Awake run < AWAKE_MIN_EPOCHS (default 4 = < 2 min) AFTER sleep onset
     -> Light  (a brief arousal, NOT an awakening)
3. REM gate (post):  re-apply step 1 after smoothing
```

A "run" = consecutive epochs of the same stage.

> **Why 2b matters.** The earlier Awake rule fired on *any* brief movement
> (`T_LAST_TURN <= 10`). Without the arousal debounce, every position shift becomes
> a separate awakening, and `awakenings × 1.5` dominates the score. With the
> revised rule, movement alone is not Awake; with `AWAKE_MIN_EPOCHS = 4`, only
> sustained Awake runs of about 2 minutes or longer remain as awakenings. This
> prevents a shredded hypnogram / phantom awakenings while still preserving real
> awakenings with physiological instability.

---

## 9. Building the hypnogram graph

After §8 you have a final `stage` per epoch. Plot a **step chart**:

- **X-axis** = time. Epoch `i` spans `[sleepStart + i*30s, +30s)`. Draw stages as a
  stepped line (stage holds flat across its epoch, steps at boundaries).
- **Y-axis** = 4 discrete levels, top to bottom **Awake, REM, Light, Deep**:

  | Stage | y-level |
  |---|---|
  | Awake | 3 |
  | REM   | 2 |
  | Light | 1 |
  | Deep  | 0 |

Pseudocode for the series:
```
points = []
for i, e in epochs:
    y = { Awake:3, REM:2, Light:1, Deep:0 }[e.stage]
    points.push({ x: e.t, y })
// render with "stepped" / step-after interpolation so each epoch is a flat segment
```

Gaps (device offline / no data) should render as a break, not interpolated.

---

## 10. Outputs (from the FINAL smoothed stage series)

Definitions:
```
recordingMinutes = totalEpochs * 0.5                 // time in bed
onsetIndex       = index of first non-Awake epoch    // sleep onset
wakeMinutes      = (# Awake epochs) * 0.5             // ALL wake (SOL + WASO + terminal)
sleepMinutes     = recordingMinutes - wakeMinutes    // <-- WAKE SUBTRACTED = time asleep
deepMin          = (# Deep epochs) * 0.5
remMin           = (# REM  epochs) * 0.5
deepPct          = deepMin / sleepMinutes * 100
remPct           = remMin  / sleepMinutes * 100
WASOmin          = (# Awake epochs AFTER onsetIndex) * 0.5
awakenings       = count of Awake runs that start AFTER onsetIndex AND last >= 4 epochs (>=2 min)
efficiency       = sleepMinutes / recordingMinutes * 100     // wake is subtracted
```

> **Efficiency ≠ Score.** Efficiency is only asleep-vs-awake *time*. The score
> also penalises low Deep%/REM% and fragmentation, so an efficient night can still
> score low (that is the 99.4 %/60 case). They are different metrics by design.

**Sleep score** (penalty model; clamp 0–100, round):
```
efficiencyPenalty = max(0, 85 - efficiency)
deepPenalty       = max(0, 15 - deepPct) * 0.7
remPenalty        = max(0, 10 - remPct)  * 0.5
wasoPenalty       = max(0, WASOmin - 30) * 0.25
awakeningPenalty  = awakenings * 1.5

// (RMSSD extension) recovery nudge from the night's median sleeping RMSSD:
// log-map 20..70 ms -> 0..1, centred at 0.5, scaled to a bounded ±1.5 pts.
// rmssdBonus = 0 when RMSSD was never present in the night (no-op).
medRMSSD    = median(all valid epoch RMSSD)          // ms, or null
f           = clamp( (ln(medRMSSD) - ln(20)) / (ln(70) - ln(20)), 0, 1 )
rmssdBonus  = (medRMSSD == null) ? 0 : (f - 0.5) * 2 * 1.5

score = round( clamp( 100 - efficiencyPenalty - deepPenalty
                          - remPenalty - wasoPenalty - awakeningPenalty
                          + rmssdBonus, 0, 100) )
```

**Label:**
| Score | Label | Message |
|---|---|---|
| > 85  | Excellent | Very good sleep quality |
| 70–85 | Good | Good sleep quality |
| 55–70 | Fair | Average or disturbed sleep |
| < 55  | Poor | Poor sleep quality |

**Recovery %** (as shown in the app header) = `deepPct + remPct` (Deep + REM share of sleep).

---

## 11. Reference pseudocode (end-of-night, JS-style)

> A **complete, runnable** implementation of everything below lives in
> [`sleep_algorithm.js`](sleep_algorithm.js) (Node: `node sleep_algorithm.js`).
> It exports `collectEpochs`, `analyseNight`, `qualityFor`, `QUALITY_TABLE`, `CFG`.
> The quality/rating table and all thresholds are in `CFG` / `QUALITY_TABLE` there.

```js
// epochs[]: {t, HR_M, Res_M, HR_SD, RESSD, MS_B, SN_B, lastMST} per 30 s
function analyseNight(epochs) {
  // §4 SDs come straight from the firmware (rolling last-10); §6 T_LAST_TURN
  for (const e of epochs) {
    e.HR_SD_5M = (e.HR_SD ?? null);     // firmware rolling SD of last 10 HR_M
    e.RR_SD_5M = (e.RESSD ?? null);     // firmware rolling SD of last 10 Res_M
    e.T_LAST_TURN = e.lastMST == null ? 99999 : (e.t - e.lastMST);
  }
  // §5 baselines
  const hr = epochs.map(e=>e.HR_M).filter(v=>v!=null);
  const rr = epochs.map(e=>e.Res_M).filter(v=>v);
  const HR_BASE=mean(hr), HR_LOW=pct(hr,25), HR_HIGH=pct(hr,75), RR_BASE=mean(rr);

  // Optional §5 baseline extension when RMSSD is available
  const rms = epochs.map(e=>e.RMSSD).filter(v=>v!=null);
  const RMSSD_BASE = rms.length ? pct(rms,50) : null;

  // §7 classify
  let firstAwakeSeen = false;
  for (let i=0; i<epochs.length; i++) {
    const e = epochs[i];
    const st  = e.HR_Stability = (e.HR_SD_5M!=null && e.HR_SD_5M<2)?1:(e.HR_SD_5M!=null&&e.HR_SD_5M<4)?2:3;
    const prev2 = epochs.slice(Math.max(0,i-2), i).map(x=>x.HR_M).filter(v=>v!=null);
    const HR_RISE_1M = prev2.length && e.HR_M!=null ? e.HR_M - mean(prev2) : null;
    const RMSSD_LOW = e.RMSSD!=null && RMSSD_BASE!=null && e.RMSSD < 0.85 * RMSSD_BASE;

    const strongAwake =
        e.HR_M>HR_BASE+12
     || e.Res_M>RR_BASE+5
     || (e.HR_SD_5M!=null && e.HR_SD_5M>=6)
     || (e.RR_SD_5M!=null && e.RR_SD_5M>=3)
     || (e.SN_B===1 && st===3);

    const movementAwake = e.T_LAST_TURN<=60 && (
        e.HR_M>HR_BASE+8
     || (HR_RISE_1M!=null && HR_RISE_1M>=5)
     || e.Res_M>RR_BASE+5
     || (e.HR_SD_5M!=null && e.HR_SD_5M>=6)
     || (e.RR_SD_5M!=null && e.RR_SD_5M>=3)
     || RMSSD_LOW
    );

    const awake = strongAwake || movementAwake;
    if (awake) { e.stage='Awake'; firstAwakeSeen=true; continue; }

    const deep = e.T_LAST_TURN>600 && e.HR_M<=HR_LOW+6
             && (e.HR_SD_5M!=null && e.HR_SD_5M<3)
             && e.Res_M<=RR_BASE+1 && (e.RR_SD_5M!=null && e.RR_SD_5M<1.2)
             && !RMSSD_LOW;                          // RMSSD extension: Deep veto
    if (deep) { e.stage='Deep'; continue; }

    const rem = firstAwakeSeen && e.T_LAST_TURN>300
             && e.HR_M>HR_LOW+4 && e.HR_M<=HR_BASE+12
             && ((e.HR_SD_5M!=null&&e.HR_SD_5M>=2) || (e.RR_SD_5M!=null&&e.RR_SD_5M>=1) || RMSSD_LOW)
             && e.MS_B===0;                          // RMSSD extension: REM support
    e.stage = rem ? 'REM' : 'Light';
  }

  remGate(epochs);           // §8 step 1
  smoothRuns(epochs);        // §8 step 2  (Deep<10, REM<6 -> Light)
  smoothAwake(epochs);       // §8 step 2b (short Awake -> Light; AWAKE_MIN_EPOCHS)
  remGate(epochs);           // §8 step 3

  return metrics(epochs);    // §10
}
```

---

## 12. Awake detection update — movement is not awakening

This version intentionally separates **movement arousal** from **true Awake**:

| Earlier behaviour | Updated behaviour |
|---|---|
| `T_LAST_TURN <= 10` directly became Awake | Removed; movement alone is not Awake |
| Every turn could create an awakening | Movement needs HR/RR/SD/RMSSD confirmation |
| Awake debounce default 2 epochs / 1 min | Awake debounce default 4 epochs / 2 min |
| Every Awake run counted as awakening | Count only Awake runs >=4 epochs after sleep onset |
| High fragmentation from normal body turns | Fewer, more physiological awakenings |

Recommended constants:

```
MOVEMENT_AWAKE_WINDOW_S = 60
HR_RISE_AWAKE_BPM       = 5
AWAKE_MIN_EPOCHS        = 4     // 4 × 30 s = 2 min
RMSSD_AWAKE_FRAC        = 0.85  // RMSSD_LOW threshold: movement-Awake confirmation
                               // AND (extension) the Deep veto / REM support
RMSSD_SCORE_PTS         = 1.5   // (extension) ± recovery-score points from sleeping RMSSD
```

> **RMSSD usage summary.** `RMSSD_LOW = RMSSD < RMSSD_AWAKE_FRAC × RMSSD_BASE`
> (median). It confirms movement-Awake (base rule), **and** as an extension it
> vetoes Deep (§7), supports REM (§7), and adds a small bounded recovery bonus to
> the score (§10). All RMSSD terms are **no-ops when RMSSD is absent** — the night
> still stages and scores on HR/RR/motion alone. Matches `sleep_algorithm.js`.

---

## 13. Why the current app numbers were wrong (fix checklist)

| Symptom | Cause | Fix |
|---|---|---|
| Efficiency 99.4% w/ 116 m WASO | efficiency computed from **movement**, not stages | §10 `efficiency = sleepMinutes/recordingMinutes` |
| 46 awakenings, shredded hypnogram | movement-only Awake and single-epoch spikes kept | §7 movement requires physiological confirmation; §8 Awake debounce = 4 epochs; §10 count only Awake runs >=2 min |
| REM 0% | corrected REM rule not implemented | §7 REM condition |
| HR_SD-driven false Awake | firmware `HR_SD` was tumbling (blank most epochs) | firmware now sends **rolling** `HR_SD`/`RESSD` per epoch — read directly (§4) |
| False Awake early in night | live/progressive baselines | §5 two-pass full-night baselines |

Implement §4–§10 and the app reproduces the workbook (score 50, efficiency 86.2 %,
Deep 73.5 m, REM 22 m) instead of 60 / 99.4 % / 46 / 0 %.
```
