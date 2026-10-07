import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDashboardData,
  buildHeatmapData,
  calculateStreaks,
  normalizeHeatmapRange,
} from '../src/dashboard.js';
import { normalizeChartMonths, sortChartData } from '../src/charts.js';

test('calculates current and longest UTC-day streaks', () => {
  const activity = [
    { day: '2026-10-01', submissions: 1, accepted: 1 },
    { day: '2026-10-02', submissions: 2, accepted: 1 },
    { day: '2026-10-04', submissions: 1, accepted: 1 },
    { day: '2026-10-05', submissions: 1, accepted: 1 },
  ];
  assert.deepEqual(calculateStreaks(activity, new Date('2026-10-05T18:00:00.000Z')), {
    currentStreak: 2,
    longestStreak: 2,
  });
  assert.deepEqual(calculateStreaks(activity, new Date('2026-10-06T18:00:00.000Z')), {
    currentStreak: 2,
    longestStreak: 2,
  });
});

test('builds a one-year dashboard summary and excludes older activity', () => {
  const data = buildDashboardData(
    {
      solvedByDifficulty: { easy: 3, medium: 2, hard: 1, unrated: 4 },
      activity: [
        { day: '2025-10-01', submissions: 99, accepted: 99 },
        { day: '2026-10-01', submissions: 2, accepted: 1 },
      ],
      platforms: [
        {
          platform: 'codeforces',
          handle: 'tourist',
          totalSolved: 10,
          rating: 3000,
        },
      ],
    },
    new Date('2026-10-07T12:00:00.000Z'),
  );
  assert.equal(data.totalSolved, 10);
  assert.equal(data.activeDaysLastYear, 1);
  assert.equal(data.contributionsLastYear, 2);
  assert.equal(data.activity.length, 1);
  assert.deepEqual(data.platforms[0], {
    platform: 'codeforces',
    handle: 'tourist',
    totalSolved: 10,
    rating: 3000,
  });
});

test('preserves UTC heatmap days across timezone boundaries', () => {
  const range = normalizeHeatmapRange('2026-10-01', '2026-10-03');
  assert.deepEqual(buildHeatmapData([{ day: '2026-10-02', submissions: 3, accepted: 2 }], range), [
    { day: '2026-10-01', submissions: 0, accepted: 0 },
    { day: '2026-10-02', submissions: 3, accepted: 2 },
    { day: '2026-10-03', submissions: 0, accepted: 0 },
  ]);
});

test('rejects invalid or oversized heatmap ranges', () => {
  assert.throws(() => normalizeHeatmapRange('2026-02-30', '2026-03-01'));
  assert.throws(() => normalizeHeatmapRange('2026-01-01', '2027-01-02'));
  assert.throws(() => normalizeHeatmapRange('2026-10-03', '2026-10-01'));
});

test('normalizes chart ranges and orders chart data for rendering', () => {
  assert.equal(normalizeChartMonths(null), 12);
  assert.equal(normalizeChartMonths('6'), 6);
  assert.throws(() => normalizeChartMonths('25'));
  const result = sortChartData({
    difficulty: [{ difficulty: 'easy', solved: 2 }],
    topics: [
      { topic: 'Arrays', solved: 2, total: 10 },
      { topic: 'Graphs', solved: 4, total: 5 },
    ],
    rating: [
      { platform: 'codeforces', ratedAt: '2026-02-01', rating: 1500 },
      { platform: 'codeforces', ratedAt: '2026-01-01', rating: 1400 },
    ],
    monthly: [
      { month: '2026-02', submissions: 2, accepted: 1 },
      { month: '2026-01', submissions: 1, accepted: 1 },
    ],
  });
  assert.equal(result.topics[0]?.topic, 'Graphs');
  assert.equal(result.rating[0]?.rating, 1400);
  assert.equal(result.monthly[0]?.month, '2026-01');
});
