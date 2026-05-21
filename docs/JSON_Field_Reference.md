# 📡 Dozemate JSON Telemetry — Field Reference Guide

> A complete reference for all fields transmitted in the Dozemate device's JSON telemetry packets.

---

## 📦 Example Packet

```json
{
  "device_id": "Dozemate-C7C7BC",
  "seq": 1640,
  "ts": 1552,
  "data": {
    "TS": 1552,
    "T": "22.00",
    "H": "39.59",
    "MS": "",
    "MST": "",
    "AS": "0",
    "HV": "0",
    "A": "12.06",
    "B": "4.43",
    "C": "5.72",
    "SS": "",
    "SST": "",
    "SF": "",
    "MAX": "",
    "RST": "",
    "RS": "",
    "L": "100",
    "HR": "",
    "RE": "",
    "VOC": "98",
    "VR": "134319",
    "VS": "0",
    "ET": ""
  }
}
```

---

## 🗂️ Field-by-Field Reference

### ⏱️ Timing & Presence

| Field | Full Name | Meaning | Notes |
|-------|-----------|---------|-------|
| `TS` | Telemetry Sample Timestamp | Timestamp of the telemetry sample | In **seconds**. This is the inner packet timestamp. |
| `MS` | High-Motion Start Timestamp | When a high-motion event began | **Blank** if no high-motion event occurred. |
| `MST` | High-Motion Stop Timestamp | When a high-motion event ended | **Blank** if no high-motion event occurred. |
| `AS` | Human / Presence State | Whether a person is detected | `1` = presence detected · `0` = no presence |

---

### 🌡️ Environmental Sensors

| Field | Full Name | Meaning | Notes |
|-------|-----------|---------|-------|
| `T` | Humidity | Relative humidity reading | ⚠️ **Legacy field position** — value is from the **AHT40 humidity** sensor, in **%RH** |
| `H` | Temperature | Ambient temperature | ⚠️ **Legacy field position** — value is from the **AHT40 temperature** sensor, in **°Celsius** |

> **Note:** The field names `T` and `H` are swapped due to legacy naming — `T` actually carries **humidity** and `H` carries **temperature**.

---

### ❤️ Heart Rate & Respiration

| Field | Full Name | Meaning | Notes |
|-------|-----------|---------|-------|
| `HV` | Heart/BCG Streaming-Valid Flag | Indicates whether HR/BCG stream is valid | `1` only when a human is present **and** the stream is valid |
| `HR` | Heart Rate | Beats per minute (BPM) | **Blank** until a valid reading is available |
| `RE` | Respiration Rate | Breathing rate | In **breaths per minute**. **Blank** until valid |

---

### 📶 Internal Signal Strengths (RMS Values)

| Field | Full Name | Meaning |
|-------|-----------|---------|
| `A` | Respiration / Presence RMS | Internal signal-strength value for respiration/presence detection |
| `B` | BCG RMS | Internal heart/body vibration signal-strength value |
| `C` | Motion RMS | Internal motion signal-strength value |

---

### 😴 Snore Detection

| Field | Full Name | Meaning | Notes |
|-------|-----------|---------|-------|
| `SS` | Snore Start Timestamp | First snore start within the 6-second window | **Blank** if no snore detected. Marks the **start of the longest snore**. |
| `SST` | Snore Stop Timestamp | Last snore stop within the 6-second window | **Blank** if no snore detected. Marks the **stop of the longest snore**. |
| `SF` | Snore Frequency Band | Frequency band of the detected snore | `1` = Low · `2` = Medium · `3` = High |
| `MAX` | Max Snore Score | Maximum snore confidence seen in the 6-second window | Percentage **0–100**. **Blank** if no snore. |
| `RST` | Total Snore Duration | Total snore duration for the packet | In **milliseconds**. Actual snore time, **subtracting gaps between snores**. Useful even alongside `SS`/`SST`. |
| `RS` | Snore Count | Number of individual snores in this packet | Useful because `SS`/`SST` alone cannot indicate count. Represents the **number of snores between SST and SS**. |

#### 🎵 Snore Frequency Band Reference

| Band | Value | Frequency Range | Description |
|------|-------|-----------------|-------------|
| Low | `1` | 50 – 200 Hz | Low-frequency snore energy |
| Medium | `2` | 200 – 800 Hz | Mid-frequency snore energy |
| High | `3` | 800 – 2000 Hz | High-frequency snore energy |

---

### 🌬️ Air Quality (VOC)

| Field | Full Name | Meaning | Notes |
|-------|-----------|---------|-------|
| `VOC` | TVOC Reading | Total Volatile Organic Compound level | From **AGS02MA** sensor, in **ppb** (parts per billion). **Best field for user-facing display.** |
| `VR` | VOC Raw Resistance | Raw sensor resistance value | Diagnostic/raw value. Useful for debugging and trending. |
| `VS` | VOC Status Code | Sensor diagnostic status byte | `0x01` = sensor **not ready** (in this driver). |

#### 🌿 VOC Air Quality Scale (ppb)

| Rating | Range |
|--------|-------|
| 🟢 Excellent | 0 – 150 |
| 🟡 Good | 151 – 300 |
| 🟠 Moderate | 301 – 600 |
| 🔴 Poor | 601 – 1000 |
| ⛔ Bad | 1000+ |

---

### 🔔 Events & Alerts

| Field | Full Name | Meaning | Notes |
|-------|-----------|---------|-------|
| `ET` | Event Text | Text description of a detected event | Currently used for **apnea-after-snore events**. Example: `APNEA_MODERATE:18000` (event type + duration in ms) |

#### 🚨 Apnea Event Severity Levels

| Event Code | Trigger Condition |
|------------|-------------------|
| `APNEA_CANDIDATE` | Under 15 seconds |
| `APNEA_MODERATE` | 15 seconds or more |
| `APNEA_SEVERE` | 30 seconds or more |
| `APNEA_CRITICAL` | 60 seconds or more |

> **Format:** `EVENT_TYPE:duration_in_ms` — e.g., `APNEA_MODERATE:18000` means a moderate apnea event lasting **18,000 ms (18 seconds)**.

---

### 🔋 Device Status

| Field | Full Name | Meaning | Notes |
|-------|-----------|---------|-------|
| `L` | Battery Level | Current battery charge | Percentage, **0 – 100** |

---

## 🔑 Quick Lookup — All Fields at a Glance

| Field | Category | Summary |
|-------|----------|---------|
| `TS` | Timing | Telemetry sample timestamp (seconds) |
| `T` | Environment | Humidity %RH *(legacy name)* |
| `H` | Environment | Temperature °C *(legacy name)* |
| `MS` | Motion | High-motion start timestamp |
| `MST` | Motion | High-motion stop timestamp |
| `AS` | Presence | Human presence flag (0/1) |
| `HV` | Heart | BCG stream valid flag (0/1) |
| `A` | Signal | Respiration/presence RMS |
| `B` | Signal | BCG (heart/body vibration) RMS |
| `C` | Signal | Motion RMS |
| `SS` | Snore | Snore start timestamp |
| `SST` | Snore | Snore stop timestamp |
| `SF` | Snore | Snore frequency band (1/2/3) |
| `MAX` | Snore | Max snore confidence score (0–100%) |
| `RST` | Snore | Total snore duration in ms |
| `RS` | Snore | Snore count in packet |
| `L` | Device | Battery level (0–100%) |
| `HR` | Health | Heart rate (BPM) |
| `RE` | Health | Respiration rate (breaths/min) |
| `VOC` | Air Quality | TVOC in ppb (user-display value) |
| `VR` | Air Quality | VOC raw resistance (diagnostic) |
| `VS` | Air Quality | VOC sensor status code |
| `ET` | Events | Event text (e.g., apnea alerts) |
