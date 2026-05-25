# Current JSON Fields

This document describes all fields present in the device telemetry JSON packets transmitted by the Dozemate sensor.

---

## Field Reference Table

| Field | Meaning | Notes |
|-------|---------|-------|
| **TS** | Telemetry sample timestamp | Seconds. Inner packet timestamp. |
| **T** | Humidity | Legacy field position. Value from AHT40 humidity, %RH. |
| **H** | Temperature | Legacy field position. Value from AHT40 temperature, Celsius. |
| **MS** | High-motion start timestamp | Blank if no high-motion event. |
| **MST** | High-motion stop timestamp | Blank if no high-motion event. |
| **AS** | Human/presence state | 1 when presence detected, else 0. |
| **HV** | Heart/BCG streaming-valid flag | 1 only when human present and HR/BCG stream is valid. |
| **A** | Respiration/presence RMS | Internal signal-strength value. |
| **B** | BCG RMS | Internal heart/body vibration signal-strength value. |
| **C** | Motion RMS | Internal motion signal-strength value. |
| **SS** | Snore start timestamp | First snore start in the 6-second window. Blank if no snore. Start of the long snore. |
| **SST** | Snore stop timestamp | Last snore stop in the 6-second window. Blank if no snore. Stop of the long snore. |
| **SF** | Snore frequency band | low, medium, High (1, 2, 3) |
| **MAX** | Max snore score | Percentage out of 100. Blank if no snore. Maximum snore confidence/score seen in the 6-second JSON window — a percentage from 0 to 100. |
| **RST** | Total snore duration | Milliseconds accumulated across snores in this packet. Useful even with SS/SST. RST is total snore duration in milliseconds for the packet — actual snore time subtracting the gap in between. |
| **RS** | Snore count | Number of snores in this packet. Useful because SS/SST cannot show count. Number of snores in SST–SS. |
| **L** | Battery level | Battery percentage, 0–100. |
| **HR** | Heart rate | BPM. Blank until valid. |
| **RE** | Respiration rate | Breaths per minute. Blank until valid. |
| **VOC** | TVOC reading | 0–1000 or more. |
| **AIR** | Air quality | 0–100. |
| **VLT** | VOC alert | 0–1. |
| **VEN** | Ventilation needed | See Ventilation Table below. |
| **ET** | Event text | Apnea-after-snore event, currently like `APNEA_MODERATE:18000`, duration in ms. Example: `APNEA_MODERATE:18000`. |

---

## Air Quality (AIR) — Level Ranges

| Level | Range |
|-------|-------|
| Excellent | 0–150 |
| Good | 151–300 |
| Moderate | 301–600 |
| Poor | 601–1000 |
| Bad | 1000+ |

---

## Snore Frequency Band (SF) — Reference Table

| Band | Frequency Range | Meaning |
|------|----------------|---------|
| 1 | 50–200 Hz | Low-frequency snore energy |
| 2 | 200–800 Hz | Mid-frequency snore energy |
| 3 | 800–2000 Hz | High-frequency snore energy |

---

## Apnea Event (ET) — Severity Levels

| Level | Duration Threshold |
|-------|--------------------|
| `APNEA_CANDIDATE` | Under 15 seconds |
| `APNEA_MODERATE` | 15 seconds or more |
| `APNEA_SEVERE` | 30 seconds or more |
| `APNEA_CRITICAL` | 60 seconds or more |

---

## Example JSON Packet

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
    "AIR": "89",
    "VLT": "0",
    "VEN": "0",
    "ET": ""
  }
}
```

> **Notes on the example packet:**
> - `AS: "0"` — No human/presence detected.
> - `HV: "0"` — Heart/BCG stream not valid (no human present).
> - `HR`, `RE`, `SS`, `SST`, `SF`, `MAX`, `RST`, `RS`, `ET` are all blank — no snore, no apnea, heart rate and respiration not yet valid.
> - `L: "100"` — Battery at 100%.
> - `VOC: "98"` and `AIR: "89"` — TVOC and air quality readings are active.
> - `VLT: "0"` and `VEN: "0"` — No VOC alert, no ventilation needed.
