import test from 'node:test';
import assert from 'node:assert/strict';
import { ingestContests, type ContestRecord } from '../src/jobs/ingest-contests.js';

const contest: ContestRecord = {
  platform: 'codeforces',
  externalId: '1',
  name: 'Round 1',
  url: 'https://codeforces.com/contests/1',
  startsAt: '2026-10-10T10:00:00.000Z',
  endsAt: '2026-10-10T12:00:00.000Z',
  source: 'codeforces',
};

test('ingests and upserts normalized contests then marks missing candidates', async () => {
  const upserted: ContestRecord[] = [];
  let seen: string[] = [];
  const result = await ingestContests(
    {
      async fetchUpcoming() {
        return [contest];
      },
    },
    {
      async upsertContest(value) {
        upserted.push(value);
      },
      async markMissingFutureContests(input) {
        seen = input.seenKeys;
        return 2;
      },
    },
    new Date('2026-10-07T00:00:00.000Z'),
  );
  assert.equal(result.fetched, 1);
  assert.equal(result.removedCandidates, 2);
  assert.deepEqual(upserted, [contest]);
  assert.deepEqual(seen, ['codeforces:1']);
});

test('rejects malformed contest data before returning success', async () => {
  await assert.rejects(
    ingestContests(
      {
        async fetchUpcoming() {
          return [{ ...contest, endsAt: contest.startsAt }];
        },
      },
      {
        async upsertContest() {},
        async markMissingFutureContests() {
          return 0;
        },
      },
    ),
    /Invalid contest/,
  );
});
