import test from 'node:test';
import assert from 'node:assert/strict';
import { AdapterError, type PlatformAdapter, type SyncResult } from '@codeorbit/adapters';
import {
  processSyncAccount,
  syncRetryDelay,
  type SyncAccountRepository,
  type SyncTransaction,
} from '../src/jobs/sync-account.js';

function adapter(result: SyncResult): PlatformAdapter {
  return {
    id: 'codeforces',
    capabilities: {
      fullSubmissionHistory: true,
      dailyActivityCalendar: false,
      ratingHistory: true,
      problemMetadataLookup: false,
    },
    validateHandle: async () => ({ exists: true, canonicalHandle: 'tourist' }),
    sync: async () => result,
  };
}

function repository(log: string[]): SyncAccountRepository {
  const transaction: SyncTransaction = {
    upsertProblem: async () => {
      log.push('problem');
      return 'problem-1';
    },
    insertSubmission: async () => log.push('submission'),
    upsertActivity: async () => log.push('activity'),
    upsertRating: async () => log.push('rating'),
    upsertSolvedProblem: async () => log.push('solved'),
    upsertPlatformStats: async () => log.push('stats'),
    completeAccount: async () => log.push('account-ok'),
  };
  return {
    getAccount: async () => ({
      id: 'account-1',
      userId: 'user-1',
      platform: 'codeforces',
      handle: 'tourist',
      status: 'pending',
    }),
    markSyncing: async () => log.push('syncing'),
    markFailed: async (_, error) => log.push(`failed:${error.code}`),
    transaction: async (callback) => callback(transaction),
    startSyncJob: async () => 'job-1',
    finishSyncJob: async (_, result) => log.push(`job:${result.status}`),
  };
}

const result: SyncResult = {
  profile: { canonicalHandle: 'tourist', totalSolved: 10 },
  submissions: [
    {
      externalId: 'submission-1',
      problem: {
        platform: 'codeforces',
        slug: '1A',
        title: 'Theatre Square',
        url: 'https://codeforces.com/problemset/problem/1/A',
      },
      verdict: 'accepted',
      submittedAt: '2026-10-07T00:00:00.000Z',
    },
  ],
  activity: [{ day: '2026-10-07', submissions: 1, accepted: 1 }],
  ratingHistory: [],
  nextCursor: { lastSubmissionId: 1 },
};

test('sync-account persists normalized data atomically and invalidates user cache', async () => {
  const log: string[] = [];
  const resultValue = await processSyncAccount(
    { accountId: 'account-1', trigger: 'manual' },
    {
      repository: repository(log),
      adapters: new Map([['codeforces', adapter(result)]]),
      cache: { invalidateUser: async () => log.push('cache') },
      now: () => new Date('2026-10-07T01:00:00.000Z'),
    },
  );

  assert.deepEqual(resultValue, { syncJobId: 'job-1', itemsFetched: 1 });
  assert.deepEqual(log, [
    'syncing',
    'problem',
    'submission',
    'solved',
    'activity',
    'stats',
    'account-ok',
    'cache',
    'job:ok',
  ]);
});

test('disabled adapters fail without entering a transaction', async () => {
  const log: string[] = [];
  await processSyncAccount(
    { accountId: 'account-1', trigger: 'scheduled' },
    { repository: repository(log), adapters: new Map() },
  );
  assert.deepEqual(log, ['failed:DISABLED', 'job:failed']);
});

test('network failures are recorded and retried', async () => {
  const log: string[] = [];
  const failing: PlatformAdapter = {
    ...adapter(result),
    sync: async () => {
      throw new AdapterError('NETWORK', 'timeout');
    },
  };
  await assert.rejects(
    processSyncAccount(
      { accountId: 'account-1', trigger: 'manual' },
      { repository: repository(log), adapters: new Map([['codeforces', failing]]) },
    ),
    /timeout/,
  );
  assert.deepEqual(log, ['syncing', 'failed:NETWORK', 'job:failed']);
});

test('persistence failures are recorded and surfaced without upstream retry', async () => {
  const log: string[] = [];
  const failingRepository = repository(log);
  failingRepository.transaction = async () => {
    throw new Error('database unavailable');
  };

  await assert.rejects(
    processSyncAccount(
      { accountId: 'account-1', trigger: 'manual' },
      {
        repository: failingRepository,
        adapters: new Map([['codeforces', adapter(result)]]),
      },
    ),
    /database unavailable/,
  );
  assert.deepEqual(log, ['syncing', 'failed:PERSISTENCE_ERROR', 'job:failed']);
});

test('retry delay policy is capped at three attempts', () => {
  assert.equal(syncRetryDelay(1), 60_000);
  assert.equal(syncRetryDelay(3), 1_800_000);
  assert.equal(syncRetryDelay(4), null);
});
