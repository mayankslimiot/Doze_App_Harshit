/**
 * Calculate user's age based on DOB string
 */
export function calculateAge(dobString: string): number {
  if (!dobString) return 0;
  const dob = new Date(dobString);
  if (isNaN(dob.getTime())) return 0;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

/**
 * Calculate BMI (Body Mass Index)
 * New BMI Formula: 1.3 * weight (kg) / height (m)^2.5
 */
export function calculateBMI(weightKg: number, heightM: number): number {
  if (heightM <= 0 || weightKg <= 0) return 0;
  return (1.3 * weightKg) / Math.pow(heightM, 2.5);
}

/**
 * Calculate Waist Height Ratio
 * WHtR = waist (m) / height (m)
 */
export function calculateWaistHeightRatio(waistM: number, heightM: number): number {
  if (heightM <= 0) return 0;
  return waistM / heightM;
}

/**
 * Calculate ABSI (A Body Shape Index)
 * Formula: 1000 × WC(m) × Weight(kg)^(−2/3) × Height(m)^(5/6)
 * Source: Krakauer & Krakauer (2012), as implemented in reference Excel
 */
export function calculateABSI(waistM: number, massKg: number, heightM: number): number {
  if (massKg <= 0 || heightM <= 0 || waistM <= 0) return 0;
  return 1000 * waistM * Math.pow(massKg, -2/3) * Math.pow(heightM, 5/6);
}

/**
 * Get BMI category and score (0-10)
 */
export function getBMIScore(bmiVal: number, age: number, gender: string = 'Male'): { score: number; category: string } {
  // 1. Determine Adjustment Factor (bmiAdj)
  let bmiAdj = 0;
  if (age > 29) {
    if (gender.toLowerCase() === 'male') {
      bmiAdj = (age - 30) * 0.07 / 5;
    } else {
      // Female or Other
      bmiAdj = (age - 30) * 0.1 / 5;
    }
  }

  // 2. Scoring (Scale of 1-10)
  let score = 0;
  if (bmiVal < 21.5) {
    score = (0.6667 * bmiVal - 4.3333) + bmiAdj;
  } else {
    score = (0.011 * bmiVal * bmiVal - 1.2032 * bmiVal + 30.79) + bmiAdj;
  }

  const finalScore = Math.min(10, Math.max(0, score));

  // 3. Category (Standard WHO BMI is used for categorization only)
  // Note: We use the raw bmiVal for categorization to keep it consistent with standard readings
  let category = 'Normal';
  if (bmiVal < 18.5) category = 'Underweight';
  else if (bmiVal < 25) category = 'Normal';
  else if (bmiVal < 30) category = 'Overweight';
  else category = 'Obese';

  return { score: Math.round(finalScore * 10) / 10, category };
}

/**
 * Get Waist Height Ratio score (0-10)
 * Male:   Score = 10 − 40 × (WHtR − 0.45)
 * Female: Score = 10 − 35 × (WHtR − 0.47)
 * Source: PDF reference sheet
 */
export function getWaistHeightRatioScore(ratioWH: number, gender: string = 'Male'): number {
  const g = gender.toLowerCase();

  let score = 0;
  if (g === 'male') {
    score = 10 - 40 * (ratioWH - 0.45);
  } else if (g === 'female') {
    score = 10 - 35 * (ratioWH - 0.47);
  } else {
    // "Other" takes the average of both
    const maleScore = 10 - 40 * (ratioWH - 0.45);
    const femaleScore = 10 - 35 * (ratioWH - 0.47);
    score = (maleScore + femaleScore) / 2;
  }

  return Math.round(Math.min(10, Math.max(0, score)) * 10) / 10;
}

/**
 * Get ABSI score (0-10)
 */
export function getABSIScore(absiVal: number): number {
  let score = 0;
  if (absiVal < 76) {
    score = 0.2 * absiVal - 5.2;
  } else {
    score = (-0.2 * absiVal) + 25.2;
  }
  return Math.round(Math.min(10, Math.max(0, score)) * 10) / 10;
}

/**
 * Calculate Overall Body Index (Weighted Average)
 * WHR: 50%, BMI: 25%, ABSI: 25%
 */
export function calculateOverallBodyIndex(
  wHOutOf10: number,
  bmiOutOf10: number,
  absiOutOf10: number
): number {
  const weightedSum = (wHOutOf10 * 50) + (absiOutOf10 * 25) + (bmiOutOf10 * 25);
  const average = weightedSum / 100;
  return Math.round(average * 10) / 10;
}

/**
 * Get gauge percentage for visualization (0-100)
 */
export function scoreToGaugePercentage(score: number): number {
  return Math.max(0, Math.min(100, (score / 10) * 100));
}

/**
 * Get gauge color based on score
 */
export function getGaugeColor(score: number): string {
  if (score >= 8) return '#4CAF50'; // Green
  if (score >= 6) return '#FFA500'; // Yellow/Orange
  return '#FF5252'; // Red
}

/**
 * Wellness-focused descriptions for body metrics.
 */
export const HINTS = {
  BMI: `BMI (Body Mass Index)\n\nBody Mass Index (BMI) is a general measure of body composition that uses your height and weight to estimate if you are in a healthy weight range for your height.\n\nIn general:\n• At the same BMI, women tend to have more body fat than men.\n• The amount of body fat may vary depending on racial or ethnic groups.\n• Older adults often have a different body composition than younger adults.\n• Athletes may have a higher BMI due to increased muscle mass.\n\nWhile BMI is a helpful screening tool, it does not directly measure body fat. This metric is for general wellness observation and should not be used as a substitute for professional health assessments.\n\nGeneral BMI Categories:\n• < 18.5 – Underweight\n• 18.5 to 24.9 - Normal range\n• 25 to 29.9 – Overweight\n• > 29.9 Obese`,
  
  ABSI: `ABSI (A Body Shape Index)\n\nA Body Shape Index (ABSI) is a wellness metric that considers your waist circumference relative to your height and weight. It provides additional perspective on body composition beyond BMI alone.\n\nABSI was designed to help observe variations in body shape that are less dependent on weight or height. This information is intended for general wellness and lifestyle observation purposes only.\n\nFor ease of understanding, we have converted the ABSI to a scale of 1 to 10, where 10 indicates a score more aligned with general wellness guidelines.`,
  
  WHR: `Waist-to-Height Ratio\n\nThe waist-to-height ratio is a simple lifestyle metric calculated by dividing your waist circumference by your height. It is often used as an indicator of general body composition and wellness.\n\nThis index is easy to use and provides a helpful way to track your wellness journey. A common general guideline is to maintain a waist circumference that is less than half your height. This information is for general observation and is not intended for medical use or as a substitute for professional advice.`,
  
  OBI: `Overall Body Index\n\nThe Overall Body Index combines multiple wellness metrics—ABSI, waist-to-height ratio, and BMI—to provide a comprehensive overview of your body composition trends. For ease of use, we have rated this index on a scale of 1 to 10. This index is intended to help you track general lifestyle and wellness trends over time.`
};

