export type DateRange = { start: string; end: string };
export type DailySummary = {
  date: string;
  totalMinutes: number;
  deepMinutes?: number;
  remMinutes?: number;
  sessionsCount?: number;
  avgHR?: number;
  hourlyBuckets?: { hour: number; minutes: number }[];
};
export type WeeklySummary = {
  weekStart: string;
  weekEnd: string;
  days: DailySummary[];
  totalMinutes: number;
  avgHR?: number;
};


