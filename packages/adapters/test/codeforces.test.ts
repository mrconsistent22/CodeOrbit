import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createCodeforcesAdapter,
  parseCodeforcesSubmissions,
  parseCodeforcesUser,
  type CodeforcesRequest,
} from '../src/codeforces.js';
import { AdapterError } from '../src/types.js';

async function fixture(name: string): Promise<unknown> {
  const file = await readFile(
    new URL(`../codeforces/__fixtures__/${name}`, import.meta.url),
    'utf8',
  );
  return JSON.parse(file) as unknown;
}

test('parses Codeforces profile and normalized sync data from fixtures', async () => {
  const userInfo = await fixture('user-info-tourist.json');
  const rating = await fixture('user-rating-tourist.json');
  const status = await fixture('user-status-tourist.json');
  const request: CodeforcesRequest = async (method) => {
    if (method === 'user.info') return userInfo;
    if (method === 'user.rating') return rating;
    return status;
  };
  const adapter = createCodeforcesAdapter(request);

  const validation = await adapter.validateHandle(' tourist ');
  assert.deepEqual(validation, { exists: true, canonicalHandle: 'tourist' });

  const result = await adapter.sync('tourist');
  assert.equal(result.profile.canonicalHandle, 'tourist');
  assert.equal(result.profile.rating, 3384);
  assert.equal(result.profile.maxRating, 4009);
  assert.equal(result.submissions[0]?.externalId, '392217392');
  assert.equal(result.submissions[0]?.problem.slug, '2268D');
  assert.equal(result.submissions[0]?.verdict, 'accepted');
  assert.deepEqual(result.activity, [{ day: '2026-09-26', submissions: 1, accepted: 1 }]);
  assert.equal(result.ratingHistory[0]?.newRating, 3384);
  assert.deepEqual(result.nextCursor, {
    lastSubmissionId: 392217392,
    lastSubmissionTime: 1790438553,
  });
});

test('filters submissions using the incremental cursor', async () => {
  const status = await fixture('user-status-tourist.json');
  const parsed = parseCodeforcesSubmissions(status, { lastSubmissionId: 392217392 });
  assert.deepEqual(parsed.submissions, []);
  assert.deepEqual(parsed.activity, []);
});

test('maps missing Codeforces handles to NOT_FOUND', async () => {
  const request: CodeforcesRequest = async () => ({
    status: 'FAILED',
    comment: 'handles: User with handle ghost not found',
  });
  const adapter = createCodeforcesAdapter(request);

  await assert.rejects(
    () => adapter.sync('ghost'),
    (error: unknown) => error instanceof AdapterError && error.code === 'NOT_FOUND',
  );
  assert.deepEqual(await adapter.validateHandle('ghost'), {
    exists: false,
    canonicalHandle: 'ghost',
  });
});

test('maps request failures to NETWORK errors', async () => {
  const request: CodeforcesRequest = async () => {
    throw new Error('socket closed');
  };
  const adapter = createCodeforcesAdapter(request);

  await assert.rejects(
    () => adapter.sync('tourist'),
    (error: unknown) => error instanceof AdapterError && error.code === 'NETWORK',
  );
});

test('rejects malformed profile payloads as upstream changes', () => {
  assert.throws(
    () => parseCodeforcesUser({ status: 'OK', result: [] }, 'tourist'),
    (error: unknown) => error instanceof AdapterError && error.code === 'UPSTREAM_CHANGED',
  );
});
