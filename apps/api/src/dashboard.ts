import type { PlatformId } from '@codeorbit/shared';

export interface DashboardActivityDay {
  day: string;
  submissions: number;
  accepted: number;
}

export interface DashboardPlatformSummary {
  platform: PlatformId;
  handle: string;
  totalSolved?: number;
  easySolved?: number;
  mediumSolved?: number;
  hardSolved?: number;
  rating?: number;
  maxRating?: number;
  rankLabel?: string;
  globalRank?: number;
}

export interface DashboardData {
  totalSolved: number;
  solvedByDifficulty: {
    easy: number;
    medium: number;
    hard: number;
    unrated: number;
  };
  currentStreak: number;
  longestStreak: number;
  activeDaysLastYear: number;
  contributionsLastYear: number;
  activity: DashboardActivityDay[];
  platforms: DashboardPlatformSummary[];
}

export interface DashboardRepository {
  getDashboardData(userId: string): Promise<{
    solvedByDifficulty: DashboardData['solvedByDifficulty'];
    activity: DashboardActivityDay[];
    platforms: DashboardPlatformSummary[];
  }>;
}

export interface HeatmapRange {
  from: string;
  to: string;
}

export interface HeatmapRepository {
  getHeatmapData(
    userId: string,
    range: HeatmapRange,
    platform?: PlatformId,
  ): Promise<DashboardActivityDay[]>;
}

export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function shiftDay(day: string, offset: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return utcDay(date);
}

export function isUtcDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && utcDay(date) === value;
}

export function defaultHeatmapRange(now = new Date()): HeatmapRange {
  const to = utcDay(now);
  return { from: shiftDay(to, -364), to };
}

export function normalizeHeatmapRange(
  from: string | null,
  to: string | null,
  now = new Date(),
): HeatmapRange {
  const fallback = defaultHeatmapRange(now);
  const range = { from: from ?? fallback.from, to: to ?? fallback.to };
  if (!isUtcDay(range.from) || !isUtcDay(range.to) || range.from > range.to) {
    throw new Error('Heatmap dates must be valid UTC days with from <= to');
  }
  const fromDate = new Date(`${range.from}T00:00:00.000Z`);
  const toDate = new Date(`${range.to}T00:00:00.000Z`);
  const days = Math.floor((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1;
  if (days > 366) throw new Error('Heatmap range cannot exceed 366 days');
  return range;
}

export function buildHeatmapData(
  activity: DashboardActivityDay[],
  range: HeatmapRange,
): DashboardActivityDay[] {
  const byDay = new Map(activity.map((entry) => [entry.day, entry]));
  const days: DashboardActivityDay[] = [];
  const fromDate = new Date(`${range.from}T00:00:00.000Z`);
  const toDate = new Date(`${range.to}T00:00:00.000Z`);
  for (
    const cursor = new Date(fromDate);
    cursor <= toDate;
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    const day = utcDay(cursor);
    const entry = byDay.get(day);
    days.push(entry ?? { day, submissions: 0, accepted: 0 });
  }
  return days;
}

function activeDays(activity: DashboardActivityDay[]): Set<string> {
  return new Set(activity.filter((entry) => entry.submissions > 0).map((entry) => entry.day));
}

export function calculateStreaks(
  activity: DashboardActivityDay[],
  now = new Date(),
): { currentStreak: number; longestStreak: number } {
  const days = activeDays(activity);
  const today = utcDay(now);
  const currentStart = days.has(today) ? today : shiftDay(today, -1);
  let currentStreak = 0;
  if (days.has(currentStart)) {
    for (let offset = 0; days.has(shiftDay(currentStart, -offset)); offset += 1) {
      currentStreak += 1;
    }
  }

  const ordered = [...days].sort();
  let longestStreak = 0;
  let run = 0;
  let previous: string | undefined;
  for (const day of ordered) {
    run = previous && shiftDay(previous, 1) === day ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
    previous = day;
  }
  return { currentStreak, longestStreak };
}

export function buildDashboardData(
  source: Awaited<ReturnType<DashboardRepository['getDashboardData']>>,
  now = new Date(),
): DashboardData {
  const cutoff = shiftDay(utcDay(now), -365);
  const activity = source.activity
    .filter((entry) => entry.day >= cutoff)
    .sort((a, b) => a.day.localeCompare(b.day));
  const streaks = calculateStreaks(activity, now);
  return {
    totalSolved: Object.values(source.solvedByDifficulty).reduce(
      (total, count) => total + count,
      0,
    ),
    solvedByDifficulty: source.solvedByDifficulty,
    ...streaks,
    activeDaysLastYear: activity.filter((entry) => entry.submissions > 0).length,
    contributionsLastYear: activity.reduce((total, entry) => total + entry.submissions, 0),
    activity,
    platforms: source.platforms,
  };
}
