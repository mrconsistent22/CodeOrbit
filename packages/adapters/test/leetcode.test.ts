import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createLeetCodeAdapter,
  parseLeetCodeProfile,
  parseLeetCodeProblem,
  parseLeetCodeSubmissions,
} from '../src/leetcode.js';
import { AdapterError } from '../src/types.js';

async function fixture(): Promise<unknown> {
  return JSON.parse(
    await readFile(
      new URL('../leetcode/__fixtures__/profile-tourist.json', import.meta.url),
      'utf8',
    ),
  ) as unknown;
}

test('parses the verified LeetCode profile fixture', async () => {
  const response = await fixture();
  const adapter = createLeetCodeAdapter(async () => response);
  assert.deepEqual(await adapter.validateHandle(' tourist '), {
    exists: true,
    canonicalHandle: 'tourist',
  });
  const result = await adapter.sync('tourist');
  assert.equal(result.profile.totalSolved, 4);
  assert.equal(result.profile.easySolved, 1);
  assert.equal(result.profile.mediumSolved, 2);
  assert.equal(result.profile.hardSolved, 1);
  assert.deepEqual(result.submissions, []);
  assert.deepEqual(result.activity, []);
});

test('parses recent accepted submissions incrementally', () => {
  const response = {
    data: {
      matchedUser: {
        username: 'alex',
        submitStats: { acSubmissionNum: [] },
        recentAcSubmissionList: [
          { id: '2', title: 'Two Sum', titleSlug: 'two-sum', timestamp: '200', lang: 'cpp' },
          { id: '1', title: 'Add Two Numbers', titleSlug: 'add-two-numbers', timestamp: '100' },
        ],
        userCalendar: { submissionCalendar: JSON.stringify({ '86400': 2 }) },
      },
    },
  };
  const parsed = parseLeetCodeSubmissions(response, { lastSubmissionTime: 150 });
  assert.equal(parsed.submissions.length, 1);
  assert.equal(parsed.submissions[0]?.problem.slug, 'two-sum');
  assert.equal(parsed.submissions[0]?.verdict, 'accepted');
  assert.deepEqual(parsed.activity, [{ day: '1970-01-02', submissions: 2, accepted: 0 }]);
});

test('lookupProblem normalizes difficulty and tags', async () => {
  const adapter = createLeetCodeAdapter(async () => ({
    data: {
      question: {
        title: 'Two Sum',
        difficulty: 'Easy',
        topicTags: [{ name: 'Array' }, { name: 'Hash Table' }],
      },
    },
  }));
  assert.deepEqual(await adapter.lookupProblem?.('two-sum'), {
    platform: 'leetcode',
    slug: 'two-sum',
    title: 'Two Sum',
    url: 'https://leetcode.com/problems/two-sum/',
    difficulty: 'easy',
    tags: ['Array', 'Hash Table'],
  });
});

test('malformed LeetCode payloads become upstream errors', () => {
  assert.throws(
    () => parseLeetCodeProfile({ data: { matchedUser: { username: 'x' } } }, 'x'),
    (error: unknown) => error instanceof AdapterError && error.code === 'UPSTREAM_CHANGED',
  );
});
