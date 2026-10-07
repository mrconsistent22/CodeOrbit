import type { PlatformId } from '@codeorbit/shared';

export interface DifficultyChartPoint {
  difficulty: 'easy' | 'medium' | 'hard' | 'unrated';
  solved: number;
}

export interface TopicChartPoint {
  topic: string;
  solved: number;
  total: number;
}

export interface RatingChartPoint {
  platform: PlatformId;
  ratedAt: string;
  rating: number;
}

export interface MonthlyChartPoint {
  month: string;
  submissions: number;
  accepted: number;
}

export interface DashboardCharts {
  difficulty: DifficultyChartPoint[];
  topics: TopicChartPoint[];
  rating: RatingChartPoint[];
  monthly: MonthlyChartPoint[];
}

export interface ChartsRepository {
  getCharts(userId: string, months: number): Promise<DashboardCharts>;
}

export function normalizeChartMonths(value: string | null): number {
  if (value === null || value === '') return 12;
  const months = Number(value);
  if (!Number.isInteger(months) || months < 1 || months > 24) {
    throw new Error('Chart months must be an integer from 1 to 24');
  }
  return months;
}

export function sortChartData(charts: DashboardCharts): DashboardCharts {
  return {
    difficulty: [...charts.difficulty],
    topics: [...charts.topics].sort(
      (left, right) =>
        right.solved / Math.max(right.total, 1) - left.solved / Math.max(left.total, 1),
    ),
    rating: [...charts.rating].sort((left, right) => left.ratedAt.localeCompare(right.ratedAt)),
    monthly: [...charts.monthly].sort((left, right) => left.month.localeCompare(right.month)),
  };
}
