/**
 * Body Metrics Calculation Utilities
 */

/**
 * Convert height from feet and inches string (e.g., "6'0\"") to total inches
 */
export function parseHeightToInches(heightStr: string): number {
  const match = heightStr.match(/(\d+)'(\d+)"/);
  if (match) {
    const feet = parseInt(match[1], 10);
    const inches = parseInt(match[2], 10);
    return feet * 12 + inches;
  }
  // Fallback: try to parse as number (assuming inches)
  return parseFloat(heightStr) || 72; // Default to 6 feet
}

/**
 * Convert height from feet and inches to meters
 */
export function heightToMeters(heightStr: string): number {
  const inches = parseHeightToInches(heightStr);
  return inches * 0.0254; // 1 inch = 0.0254 meters
}

/**
 * Calculate BMI (Body Mass Index)
 * BMI = weight (kg) / height (m)^2
 */
export function calculateBMI(weightKg: number, heightM: number): number {
  if (heightM <= 0 || weightKg <= 0) return 0;
  return weightKg / (heightM * heightM);
}

/**
 * Calculate Waist Height Ratio
 * WHtR = waist (inches) / height (inches)
 */
export function calculateWaistHeightRatio(waistInches: number, heightInches: number): number {
  if (heightInches <= 0) return 0;
  return waistInches / heightInches;
}

/**
 * Calculate ABSI (A Body Shape Index)
 * ABSI = waist (m) / (BMI^(2/3) * height^(1/2))
 */
export function calculateABSI(waistM: number, bmi: number, heightM: number): number {
  if (bmi <= 0 || heightM <= 0) return 0;
  const denominator = Math.pow(bmi, 2/3) * Math.pow(heightM, 1/2);
  if (denominator <= 0) return 0;
  return (waistM / denominator) * 1000; // Scale by 1000 for readability
}

/**
 * Get BMI category and score (0-10)
 */
export function getBMIScore(bmi: number): { score: number; category: string } {
  if (bmi < 18.5) {
    // Underweight
    const score = Math.max(0, (bmi / 18.5) * 5);
    return { score: Math.round(score * 10) / 10, category: 'Underweight' };
  } else if (bmi < 25) {
    // Normal weight
    const score = 5 + ((bmi - 18.5) / (25 - 18.5)) * 5;
    return { score: Math.round(score * 10) / 10, category: 'Normal' };
  } else if (bmi < 30) {
    // Overweight
    const score = 10 - ((bmi - 25) / (30 - 25)) * 3;
    return { score: Math.round(score * 10) / 10, category: 'Overweight' };
  } else {
    // Obese
    const score = Math.max(0, 7 - ((bmi - 30) / 10) * 2);
    return { score: Math.round(score * 10) / 10, category: 'Obese' };
  }
}

/**
 * Get Waist Height Ratio score (0-10)
 * Optimal range: 0.4-0.5 for men, 0.35-0.42 for women
 */
export function getWaistHeightRatioScore(ratio: number, gender: string = 'Male'): number {
  const isMale = gender.toLowerCase() === 'male';
  const optimalMin = isMale ? 0.4 : 0.35;
  const optimalMax = isMale ? 0.5 : 0.42;
  
  if (ratio < optimalMin) {
    const score = (ratio / optimalMin) * 7;
    return Math.round(score * 10) / 10;
  } else if (ratio <= optimalMax) {
    const score = 7 + ((ratio - optimalMin) / (optimalMax - optimalMin)) * 3;
    return Math.round(score * 10) / 10;
  } else {
    const excess = ratio - optimalMax;
    const score = Math.max(0, 10 - (excess / 0.1) * 3);
    return Math.round(score * 10) / 10;
  }
}

/**
 * Get ABSI score (0-10)
 * Lower ABSI is generally better
 */
export function getABSIScore(absi: number): number {
  // ABSI typically ranges from 0.06 to 0.10
  // Lower is better, so we invert the scale
  const normalized = Math.max(0, Math.min(1, (0.10 - absi / 1000) / 0.04));
  const score = normalized * 10;
  return Math.round(score * 10) / 10;
}

/**
 * Calculate Overall Body Index (average of all scores)
 */
export function calculateOverallBodyIndex(
  waistHeightScore: number,
  bmiScore: number,
  absiScore: number
): number {
  const average = (waistHeightScore + bmiScore + absiScore) / 3;
  return Math.round(average * 10) / 10;
}

/**
 * Get gauge percentage for visualization (0-100)
 * Maps score (0-10) to percentage
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
