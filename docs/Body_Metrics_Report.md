# Body Metrics Report
**Hybrid Calculation · PDF Formula + Excel Formula**

| Parameter | Value | Converted |
|-----------|-------|-----------|
| Age | 22 years | — |
| Date of Birth | 07 Dec 2003 | — |
| Gender | Male (primary) | Female (comparison) |
| Weight | 70 kg | — |
| Height | 5 ft 4 in | 1.6256 m / 64 inches |
| Waist Size | 35 inches | 0.889 m |

> **Formula sources:** BMI → PDF (BMInew) | ABSI → Excel | WHtR scoring → PDF | OBI weights → PDF

---

## 1. BMI — Body Mass Index
*Formula source: PDF (Nick Trefethen's BMInew, 2013)*

**Formula:**
```
BMInew = 1.3 × Weight(kg) / Height(m)^2.5
```

**Calculation:**
```
= 1.3 × 70 / 1.6256^2.5
= 91 / 3.3693
BMInew = 27.01 kg/m²
```

**BMI Score Formula** (since BMI ≥ 21.5):
```
Score = 0.011 × BMI² − 1.2032 × BMI + 30.79 + Age Factor
```

> Age Factor: only applies if Age > 29. Since Age = 22 → **Factor = 0**

```
= 0.011 × 27.01² − 1.2032 × 27.01 + 30.79
= 8.0243 − 32.4971 + 30.79
BMI Score = 6.32 / 10  (same for Male & Female)
```

---

## 2. ABSI — A Body Shape Index
*Formula source: Excel (multiplies by Ht^5/6)*

**Formula:**
```
ABSI = 1000 × WC(m) × Weight(kg)^(−2/3) × Height(m)^(5/6)
```

**Calculation:**
```
= 1000 × 0.889 × 70^(−0.6667) × 1.6256^(0.8333)
= 1000 × 0.889 × 0.058876 × 1.499149
ABSI = 78.47
```

**ABSI Score Formula** (since ABSI ≥ 76):
```
Score = −0.2 × ABSI + 25.2
```

```
= −0.2 × 78.47 + 25.2
= −15.694 + 25.2
ABSI Score = 9.51 / 10  (same for Male & Female)
```

---

## 3. Waist-to-Height Ratio (WHtR)
*Formula source: PDF (linear scoring, gender-specific baselines)*

**Formula:**
```
WHtR = Waist (inches) / Height (inches)
```

**Calculation:**
```
= 35 / 64
WHtR = 0.5469
```

### WHtR Score — Male
```
Score = 10 − 40 × (WHtR − 0.45)
      = 10 − 40 × (0.5469 − 0.45)
      = 10 − 40 × 0.0969
      = 10 − 3.875
Male WHtR Score = 6.12 / 10
```

### WHtR Score — Female
```
Score = 10 − 35 × (WHtR − 0.47)
      = 10 − 35 × (0.5469 − 0.47)
      = 10 − 35 × 0.0769
      = 10 − 2.691
Female WHtR Score = 7.31 / 10
```

---

## 4. OBI — Overall Body Index
*Formula source: PDF | Weights: 25% BMI + 25% ABSI + 50% WHtR*

**Formula:**
```
OBI = 0.25 × BMI Score + 0.25 × ABSI Score + 0.50 × WHtR Score
```

### OBI — Male
```
= (0.25 × 6.32) + (0.25 × 9.51) + (0.50 × 6.12)
= 1.58 + 2.38 + 3.06
Male OBI = 7.02 / 10
```

### OBI — Female
```
= (0.25 × 6.32) + (0.25 × 9.51) + (0.50 × 7.31)
= 1.58 + 2.38 + 3.65
Female OBI = 7.61 / 10
```

---

## Final Summary

| Metric | Formula Source | Value | Male Score | Female Score |
|--------|---------------|-------|------------|--------------|
| BMI (new) | PDF | 27.01 | 6.32 / 10 | 6.32 / 10 |
| ABSI | Excel | 78.47 | 9.51 / 10 | 9.51 / 10 |
| WHtR | PDF | 0.5469 | 6.12 / 10 | 7.31 / 10 |
| **OBI** | **PDF weights** | **—** | **7.02 / 10** | **7.61 / 10** |

**Male OBI 7.02 / 10 → Good** | **Female OBI 7.61 / 10 → Good**

> **Key insight:** BMI and ABSI scores are identical for both genders (no gender split in either formula). Only the WHtR scoring uses gender-specific baselines — female threshold is 0.47 (vs male 0.45) with a gentler ×35 slope (vs ×40), giving females +1.19 points on WHtR. Since WHtR carries 50% of OBI weight, that adds +0.59 to the female OBI.

---

*All calculations use hybrid sourcing as specified. BMI formula: Trefethen (2013). ABSI formula: Krakauer & Krakauer (2012) as implemented in source Excel. WHtR scoring and OBI weights: as per PDF reference sheet.*
