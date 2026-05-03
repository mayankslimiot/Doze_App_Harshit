# Body Measurement Calculations Guide

This guide provides the exact formulas, logic, and health thresholds used in the Dozemate project for calculating BMI, ABSI, Waist-to-Height Ratio, and the Overall Body Index (OBI).

## 1. Input Variables
The following variables are required for all calculations:
- `massKg`: Body weight in Kilograms.
- `heightM`: Height in Meters.
- `waistM`: Waist circumference in Meters.
- `gender`: "Male", "Female", or "Other".
- `age`: User's age in years (calculated from DOB).

---

## 2. BMI (Body Mass Index)

### Calculation Logic
The raw BMI value is calculated using a modified formula:
```java
bmiVal = 1.3 * massKg / Math.pow(heightM, 2.5);
```

### Age & Gender Impact (Adjustment Factor)
An adjustment factor (`bmiAdj`) is applied only if the user is **over 29 years old**:
- **If Age > 29**:
  - **Male**: `bmiAdj = (age - 30) * 0.07 / 5`
  - **Female/Other**: `bmiAdj = (age - 30) * 0.1 / 5`
- **Else (Age <= 29)**:
  - `bmiAdj = 0`

### Scoring (Scale of 1-10)
The raw `bmiVal` is converted to a 0-10 score (`bmiOutOf10`):
- **If bmiVal < 21.5**:
  - `score = (0.6667 * bmiVal - 4.3333) + bmiAdj`
- **Else**:
  - `score = (0.011 * bmiVal * bmiVal - 1.2032 * bmiVal + 30.79) + bmiAdj`

**Final Score Constraint**: `bmiOutOf10 = Math.min(10, Math.max(0, score))`

### Standard BMI Readings (for Reference)
- `< 18.5`: Underweight
- `18.5 to 24.9`: Normal weight
- `25 to 29.9`: Overweight
- `> 29.9`: Obese

---

## 3. ABSI (A Body Shape Index)

### Calculation Logic
```java
absiVal = (1000 * waistM) / (Math.pow(massKg, 0.66666) * Math.pow(heightM, 0.83333));
```

### Scoring (Scale of 1-10)
The raw `absiVal` is converted to a 0-10 score (`absiOutOf10`):
- **If absiVal < 76**:
  - `score = 0.2 * absiVal - 5.2`
- **Else**:
  - `score = (-0.2 * absiVal) + 25.2`

**Final Score Constraint**: `absiOutOf10 = Math.min(10, Math.max(0, score))`

---

## 4. Waist-to-Height Ratio (WHR)

### Calculation Logic
```java
ratioWH = waistM / heightM;
```

### Gender Impact on Scoring
The score out of 10 (`wHOutOf10`) depends heavily on gender thresholds:

#### Male Logic:
- **If ratioWH > 0.48**:
  - `score = 10 - (ratioWH - 0.48) * 100`
- **Else**:
  - `score = Math.min(10, 10 + (ratioWH - 0.45) * 100)`

#### Female Logic:
- **If ratioWH > 0.49**:
  - `score = 10 - (ratioWH - 0.49) * 100`
- **Else**:
  - `score = Math.min(10, 10 + (ratioWH - 0.43) * 100)`

#### "Other" Gender:
- Calculates both Male and Female scores and takes the average.

**Final Score Constraint**: `wHOutOf10 = Math.max(0, score)`

---

## 5. OBI (Overall Body Index)

The OBI is a combined health metric that weights the three scores above.

### Calculation Logic
```java
overAllOutOf10 = (wHOutOf10 * 50) + (absiOutOf10 * 25) + (bmiOutOf10 * 25);
overAllOutOf10 = overAllOutOf10 / 100;
```
*Note: This results in a weighted average where WHR contributes 50%, while BMI and ABSI each contribute 25%.*

---

## 6. Popup Hint Texts (Exact Verbatim)

### BMI Hint
> **BMI (Body Mass Index)**
> 
> Body Mass Index (BMI) is a general measure of body composition that uses your height and weight to estimate if you are in a healthy weight range for your height.
> 
> In general:
> • At the same BMI, women tend to have more body fat than men.
> • The amount of body fat may vary depending on racial or ethnic groups.
> • Older adults often have a different body composition than younger adults.
> • Athletes may have a higher BMI due to increased muscle mass.
> 
> While BMI is a helpful screening tool, it does not directly measure body fat. This metric is for general wellness observation and should not be used as a substitute for professional health assessments.
> 
> General BMI Categories:
> • < 18.5 – Underweight
> • 18.5 to 24.9 - Normal range
> • 25 to 29.9 – Overweight
> • > 29.9 Obese

### ABSI Hint
> **ABSI (A Body Shape Index)**
> 
> A Body Shape Index (ABSI) is a wellness metric that considers your waist circumference relative to your height and weight. It provides additional perspective on body composition beyond BMI alone.
> 
> ABSI was designed to help observe variations in body shape that are less dependent on weight or height. This information is intended for general wellness and lifestyle observation purposes only.
> 
> For ease of understanding, we have converted the ABSI to a scale of 1 to 10, where 10 indicates a score more aligned with general wellness guidelines.

### Waist-to-Height Ratio Hint
> **Waist-to-Height Ratio**
> 
> The waist-to-height ratio is a simple lifestyle metric calculated by dividing your waist circumference by your height. It is often used as an indicator of general body composition and wellness.
> 
> This index is easy to use and provides a helpful way to track your wellness journey. A common general guideline is to maintain a waist circumference that is less than half your height. This information is for general observation and is not intended for medical use or as a substitute for professional advice.

### OBI Hint
> **Overall Body Index**
> 
> The Overall Body Index combines multiple wellness metrics—ABSI, waist-to-height ratio, and BMI—to provide a comprehensive overview of your body composition trends. For ease of use, we have rated this index on a scale of 1 to 10. This index is intended to help you track general lifestyle and wellness trends over time.
