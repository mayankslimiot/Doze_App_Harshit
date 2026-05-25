# HR Sleep Metrics — Implementation Specification

> **Context:** These 4 metrics are already part of the existing app's **Sleep Screen**.  
> This document defines what each metric means, how it is calculated from raw sensor data, when the calculation runs, and which graph/chart to render for each metric.

---

## Overview

The app receives raw heart rate (HR) data every 6 seconds from the Dozemate sensor during a sleep session. When a sleep session ends (or is being processed), these 4 metrics are computed from that night's HR stream and displayed on the Sleep Screen.

**The 4 metrics to implement:**

| # | Metric | Short description |
|---|--------|-------------------|
| 1 | Recovery % | How much the heart recovered during sleep |
| 2 | HR Stability | How steady the heart rate was across the night |
| 3 | Resting HR Comparison | Tonight's resting HR vs 7-day average |
| 4 | Recovery % Comparison | Tonight's recovery vs weekly & monthly average |

> **Note:** Night HR Drop was considered but is NOT included in the app. Only the 4 metrics above are to be implemented.

---

## When Are These Metrics Calculated?

These metrics are calculated **at the end of a sleep session**, i.e., when:

- The user wakes up and the sleep session is marked as complete, **OR**
- The app detects end-of-sleep via presence/motion logic (`AS` field = 0 for extended period)

The full night's HR data stream (all packets where `HV = 1`, meaning heart rate was valid) is collected and then processed together to compute all 4 metrics.

```
Sleep Session Start  →  HR data collected every 6 sec (HV=1 only)  →  Sleep Session End  →  Calculate all 4 metrics  →  Display on Sleep Screen
```

**Only include HR packets where:**
- `HV = 1` (heart/BCG stream is valid)
- `AS = 1` (human presence detected)
- `HR` field is not blank/null

---

## Raw Data Fields Used

From the device JSON payload, the relevant fields are:

| JSON Field | Meaning | Used For |
|------------|---------|----------|
| `HR` | Heart rate in BPM | All 4 metrics |
| `HV` | HR valid flag (1 = valid) | Filter: only use HR when HV=1 |
| `AS` | Presence state (1 = human present) | Filter: only use when AS=1 |
| `TS` | Timestamp of packet | Ordering data chronologically |

---

## Metric 1 — Recovery %

### What it is
The percentage by which heart rate dropped from the average sleep HR down to the resting (lowest quartile) HR. A higher percentage means the body recovered more deeply during sleep.

### Formula

```
Avg_Sleep_HR     = mean of all valid HR values for the night

Resting_HR (P25) = mean of the lowest 25% of all valid HR values
                   (i.e., lower quartile — represents the deepest rest state)

Recovery_%       = ((Avg_Sleep_HR - Resting_HR) / Avg_Sleep_HR) × 100
```

### Step-by-step calculation

```python
valid_hr_list = [packet.HR for packet in night_packets if packet.HV == 1 and packet.HR is not None]

avg_sleep_hr = mean(valid_hr_list)

sorted_hr = sorted(valid_hr_list)
p25_count  = len(sorted_hr) // 4
resting_hr = mean(sorted_hr[:p25_count])   # lower quartile mean = P25

recovery_pct = ((avg_sleep_hr - resting_hr) / avg_sleep_hr) * 100
```

### Interpretation thresholds

| Recovery % | Meaning |
|------------|---------|
| < 5% | Poor recovery |
| 5 – 10% | Moderate |
| 10 – 20% | Good |
| > 20% | Excellent |

### Graph to use

**Gauge / Radial progress chart**

- A single semi-circle or full radial gauge showing the recovery % value (0–30% range is sufficient).
- Color the arc dynamically based on the threshold: red → amber → green → teal.
- Display the numeric value (e.g., `18%`) in the center of the gauge.
- Below the gauge, show the interpreted label: `Good`, `Excellent`, etc.

```
Chart type   : Radial gauge (donut / arc style)
Data point   : Single value — recovery_pct
Color coding : < 5% = red | 5–10% = amber | 10–20% = green | > 20% = teal
Label        : Show % value + threshold label (e.g. "18% · Good")
```

---

## Metric 2 — HR Stability

### What it is
Measures how much the heart rate fluctuated across the night. Calculated as the difference between the upper quartile mean (M75) and lower quartile mean (M25) of all valid HR values. A smaller range = more stable, restful sleep. A larger range = disturbed or stressed sleep.

### Formula

```
sorted_HR = all valid HR values sorted ascending

M25 = mean of the lowest  25% of sorted_HR   (lower quartile mean)
M75 = mean of the highest 25% of sorted_HR   (upper quartile mean)

HR_Stability = M75 - M25
```

### Step-by-step calculation

```python
valid_hr_list = [packet.HR for packet in night_packets if packet.HV == 1 and packet.HR is not None]

sorted_hr = sorted(valid_hr_list)
n         = len(sorted_hr)
q         = n // 4

m25 = mean(sorted_hr[:q])        # lower quartile
m75 = mean(sorted_hr[n - q:])    # upper quartile

hr_stability = m75 - m25         # result in BPM
```

### Interpretation thresholds

| Stability Range | Meaning |
|-----------------|---------|
| < 10 bpm | Very stable sleep |
| 10 – 20 bpm | Normal |
| > 20 bpm | Disturbed / stressed sleep |

### Graph to use

**Horizontal range bar (min–max style)**

- Show the full HR range of the night as a thin background bar (min HR to max HR).
- Overlay a highlighted segment from M25 to M75 in the center.
- Mark the M25 and M75 values at each end of the highlighted segment with labels.
- Color the segment based on stability threshold: green (< 10), amber (10–20), red (> 20).

```
Chart type   : Horizontal range / band bar
X-axis       : BPM values (e.g., 50–100 BPM)
Segments     : Full range (light gray) + M25→M75 band (colored)
Labels       : Show M25 value | HR_Stability value | M75 value
Color coding : < 10 bpm = green | 10–20 bpm = amber | > 20 bpm = red
```

Alternatively, a **box plot (single night)** works well here — showing min, P25, median, P75, max.

---

## Metric 3 — Resting HR Comparison

### What it is
Compares tonight's resting HR (P25 — the lowest quartile HR, which represents the body's deepest rest state during sleep) against the 7-night rolling average of resting HR. This tells whether tonight's recovery was better or worse than recent history.

### Formula

```
Tonight_Resting_HR  = P25 of tonight's valid HR values (same M25 from Metric 2)

Weekly_Avg_Resting  = mean of [Resting_HR for each of the last 7 nights]
                      (stored in local DB / backend after each sleep session)

Resting_HR_Delta    = Weekly_Avg_Resting - Tonight_Resting_HR
```

> A **positive delta** means tonight's resting HR was LOWER than average → better recovery.  
> A **negative delta** means tonight's resting HR was HIGHER than average → more stress/fatigue.

### Step-by-step calculation

```python
tonight_resting_hr = m25   # already computed in Metric 2

# Load last 7 nights' resting HR values from storage
past_7_resting = db.get_resting_hr_last_n_nights(n=7)

if len(past_7_resting) >= 1:
    weekly_avg_resting = mean(past_7_resting)
    delta = weekly_avg_resting - tonight_resting_hr
else:
    weekly_avg_resting = None   # baseline not yet available (need min 1 night)
    delta = None
```

> **Important:** After each sleep session, save `tonight_resting_hr` to the local database so future nights can build the rolling average. A 14-night baseline is ideal before showing comparisons (as noted in the original spec), but start showing after 1 night of history.

### Interpretation

| Delta | Meaning | Display message |
|-------|---------|-----------------|
| Positive (tonight lower) | Better recovery | "Your resting HR was X bpm lower than your weekly average" |
| Zero | Same as usual | "Your resting HR matched your weekly average" |
| Negative (tonight higher) | More stress/fatigue | "Your resting HR was X bpm higher than your weekly average" |

### Graph to use

**Side-by-side vertical bar chart (2 bars)**

- Bar 1: Weekly average resting HR (gray)
- Bar 2: Tonight's resting HR (green if lower, red if higher than avg)
- Y-axis: BPM
- Show a horizontal dashed reference line at weekly average value
- Label both bars with their BPM values

```
Chart type   : Grouped bar chart (2 bars)
Bars         : [Weekly avg resting HR] vs [Tonight resting HR]
Y-axis       : BPM (start from a sensible minimum, e.g. 50 bpm)
Reference    : Dashed horizontal line at weekly avg BPM
Color        : Tonight bar = green if below avg | red if above avg
Labels       : Show BPM value on top of each bar
```

---

## Metric 4 — Recovery % Comparison

### What it is
Shows how tonight's Recovery % (Metric 1) compares against the 7-day rolling average and 30-day rolling average of Recovery %. This gives the user a trend view — are they sleeping and recovering better over time?

### Formula

```
Tonight_Recovery_%   = already computed in Metric 1

Weekly_Avg_Recovery  = mean of [Recovery_% for each of the last 7 nights]

Monthly_Avg_Recovery = mean of [Recovery_% for each of the last 30 nights]
```

### Step-by-step calculation

```python
tonight_recovery_pct = recovery_pct   # from Metric 1

# Load past recovery % values from storage
past_7_recovery  = db.get_recovery_pct_last_n_nights(n=7)
past_30_recovery = db.get_recovery_pct_last_n_nights(n=30)

weekly_avg_recovery  = mean(past_7_recovery)  if len(past_7_recovery)  >= 1 else None
monthly_avg_recovery = mean(past_30_recovery) if len(past_30_recovery) >= 1 else None
```

> **Important:** After each sleep session, save `tonight_recovery_pct` to the local database.

### Interpretation

| Comparison | Meaning |
|------------|---------|
| Tonight > Weekly avg | Better than usual — improving |
| Tonight ≈ Weekly avg | Consistent |
| Tonight < Weekly avg | Below average — watch trend |

### Graph to use

**Line chart (trend over last 7 nights + tonight)**

- X-axis: Night labels (Night 1 … Tonight) — last 7 nights + tonight = 8 data points
- Y-axis: Recovery % (0–30% range)
- Line 1: Nightly Recovery % values (solid green line with dots)
- Reference line 1: 7-day average (dashed amber line, flat horizontal)
- Reference line 2: 30-day average (dashed red line, flat horizontal) — show only once 30 nights of data exist
- Highlight tonight's data point with a larger dot and a callout label

```
Chart type        : Line chart
X-axis            : Last 7 nights + tonight (8 points)
Y-axis            : Recovery % (0 – 30%)
Series 1 (solid)  : Nightly recovery % — green, with filled dots
Series 2 (dashed) : 7-day avg — amber dashed horizontal line
Series 3 (dashed) : 30-day avg — red dashed horizontal line (show after 30 nights)
Highlight         : Tonight's point = larger dot + label (e.g. "18% tonight")
Legend            : Show all 3 series in legend
```

---

## Data Storage Requirements

After every completed sleep session, persist the following to local DB (or backend):

```
sleep_session {
  date              : ISO date string (e.g. "2026-05-24")
  resting_hr        : float   -- M25 (Metric 2 / Metric 3)
  avg_sleep_hr      : float   -- used in Recovery % calc
  recovery_pct      : float   -- Metric 1 / Metric 4
  hr_stability      : float   -- Metric 2
  m25               : float   -- lower quartile HR
  m75               : float   -- upper quartile HR
}
```

This record is what powers Metrics 3 and 4 (the comparison/trend metrics) for future nights.

---

## Sleep Screen — Display Summary

| Metric | Display component | Position suggestion |
|--------|-------------------|---------------------|
| Recovery % | Radial gauge | Top / hero section |
| HR Stability | Horizontal range bar | Below gauge |
| Resting HR Comparison | 2-bar grouped bar chart | Middle section |
| Recovery % Comparison | 7-night line chart with reference lines | Bottom / trends section |

All 4 metrics are shown together on the Sleep Screen after a sleep session is processed. If baseline data is not yet available (e.g., first night), show the metric value for tonight only and display a message like: *"Keep sleeping with the device — comparisons will appear after a few nights."*

---

## Edge Cases

| Situation | Handling |
|-----------|----------|
| `HR` field is blank / null in a packet | Skip that packet entirely |
| `HV = 0` for entire session | Do not compute metrics — show "Not enough valid HR data" |
| Less than 4 valid HR packets | Do not compute quartiles — need minimum ~20 packets (2 mins) |
| First night (no historical data) | Show Metrics 1 & 2 only; Metrics 3 & 4 require at least 1 prior night |
| Avg sleep HR = 0 (division by zero) | Guard: if avg_sleep_hr == 0, skip Recovery % calculation |

---

*End of specification.*
