import { createHmac } from 'node:crypto';
import { once } from 'node:events';
import { request } from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiServer } from '../src/main.js';
import type { AppConfig } from '@codeorbit/config';
import type { SessionUser, UserRepository } from '../src/users.js';
import type { Account, AccountRepository, SyncQueue } from '../src/accounts.js';
import type { PlatformAdapter } from '@codeorbit/adapters';
import type { DashboardRepository } from '../src/dashboard.js';
import type { ChartsRepository } from '../src/charts.js';
import type { ContestRepository } from '../src/contests.js';
import type { ReminderRepository } from '../src/reminders.js';
import type { AdminSyncControl } from '../src/admin.js';

const config: AppConfig = {
  nodeEnv: 'test',
  apiPort: 0,
  databaseUrl: 'postgresql://test:test@localhost:5432/test',
  redisUrl: 'redis://localhost:6379',
  authSecret: 'test-secret',
  apiJwtSecret: 'test-jwt-secret',
  internalApiSecret: 'test-internal-secret',
  webOrigin: 'http://localhost:3000',
  enableCodeChefAdapter: false,
  enableGfgAdapter: false,
};

const user: SessionUser = {
  id: '00000000-0000-0000-0000-000000000123',
  email: 'alex@example.com',
  username: 'alex',
  displayName: 'Alex Kumar',
};

function repository(): UserRepository {
  return {
    async upsertFromSession(sessionUser) {
      return sessionUser;
    },
    async findById(id) {
      return id === user.id ? user : undefined;
    },
  };
}

function accountRepository(accounts: Account[] = []): AccountRepository {
  return {
    async listByUser(userId) {
      return accounts.filter((account) => account.userId === userId);
    },
    async create(input) {
      const account: Account = {
        id: '00000000-0000-0000-0000-000000000456',
        ...input,
        status: 'pending',
      };
      accounts.push(account);
      return account;
    },
    async delete(accountId, userId) {
      const index = accounts.findIndex(
        (account) => account.id === accountId && account.userId === userId,
      );
      if (index < 0) return false;
      accounts.splice(index, 1);
      return true;
    },
    async getById(accountId, userId) {
      return accounts.find((account) => account.id === accountId && account.userId === userId);
    },
    async markPending(accountId) {
      const account = accounts.find((item) => item.id === accountId);
      if (account) account.status = 'pending';
    },
  };
}

function adapter(): PlatformAdapter {
  return {
    id: 'codeforces',
    capabilities: {
      fullSubmissionHistory: true,
      dailyActivityCalendar: false,
      ratingHistory: true,
      problemMetadataLookup: false,
    },
    async validateHandle(handle) {
      return { exists: handle === 'tourist', canonicalHandle: 'tourist' };
    },
    async sync() {
      return {
        profile: { canonicalHandle: 'tourist' },
        submissions: [],
        activity: [],
        ratingHistory: [],
      };
    },
  };
}

function queue(jobs: string[]): SyncQueue {
  return {
    async enqueue(input) {
      jobs.push(`${input.trigger}:${input.accountId}`);
      return { jobId: 'job-1' };
    },
  };
}

function token(claims: Record<string, unknown>): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode(claims);
  const signature = createHmac('sha256', config.apiJwtSecret)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}

async function call(path: string, authorization?: string) {
  const server = createApiServer(config, repository());
  server.listen(0);
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address === 'object');

  const response = await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
    const requestInstance = request(
      {
        hostname: '127.0.0.1',
        port: address.port,
        path,
        headers: authorization ? { authorization } : undefined,
      },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => (body += chunk));
        response.on('end', () => resolve({ statusCode: response.statusCode ?? 0, body }));
      },
    );
    requestInstance.on('error', reject);
    requestInstance.end();
  });

  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return { ...response, json: JSON.parse(response.body) as Record<string, unknown> };
}

async function callWithOptions(options: {
  path: string;
  method: string;
  body?: unknown;
  accounts: AccountRepository;
  adapters?: ReadonlyMap<'codeforces', PlatformAdapter>;
  queue: SyncQueue;
  dashboard?: DashboardRepository;
  heatmap?: {
    getHeatmapData: (
      userId: string,
      range: { from: string; to: string },
      platform?: 'codeforces',
    ) => Promise<Array<{ day: string; submissions: number; accepted: number }>>;
  };
  charts?: ChartsRepository;
  contests?: ContestRepository;
  reminders?: ReminderRepository;
  admin?: AdminSyncControl;
  role?: 'user' | 'admin';
}) {
  const server = createApiServer(
    config,
    repository(),
    options.accounts,
    options.adapters,
    options.queue,
    options.dashboard,
    options.heatmap,
    options.charts,
    options.contests,
    options.reminders,
    options.admin,
  );
  server.listen(0);
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address === 'object');
  const response = await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
    const requestInstance = request(
      {
        hostname: '127.0.0.1',
        port: address.port,
        path: options.path,
        method: options.method,
        headers: {
          authorization: `Bearer ${token({ sub: user.id, role: 'user' })}`,
          ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
        },
      },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => (body += chunk));
        response.on('end', () => resolve({ statusCode: response.statusCode ?? 0, body }));
      },
    );
    requestInstance.on('error', reject);
    requestInstance.end(options.body === undefined ? undefined : JSON.stringify(options.body));
  });
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  let json: Record<string, unknown> | undefined;
  try {
    json = response.body ? (JSON.parse(response.body) as Record<string, unknown>) : undefined;
  } catch {
    json = undefined;
  }
  return { ...response, json };
}

test('GET /health returns a healthy API response', async () => {
  const response = await call('/health');
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json, { status: 'ok', service: 'api' });
});

test('unknown routes use the standard error shape', async () => {
  const response = await call('/unknown');
  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json, {
    error: { code: 'NOT_FOUND', message: 'Route not found', details: {} },
  });
});

test('protected routes reject missing and invalid JWTs', async () => {
  const missing = await call('/api/v1/me');
  assert.equal(missing.statusCode, 401);
  assert.equal((missing.json.error as { code: string }).code, 'UNAUTHORIZED');

  const invalid = await call('/api/v1/me', 'Bearer invalid');
  assert.equal(invalid.statusCode, 401);
  assert.equal((invalid.json.error as { code: string }).code, 'UNAUTHORIZED');
});

test('protected routes expose the authenticated subject', async () => {
  const response = await call('/api/v1/me', `Bearer ${token({ sub: user.id, role: 'user' })}`);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json, { user });
});

test('admin sync controls require admin role and expose queue state', async () => {
  let killSwitch = false;
  const admin: AdminSyncControl = {
    async getQueueStats() {
      return [{ name: 'sync-codeforces', waiting: 2, active: 1, failed: 0, delayed: 3 }];
    },
    async getKillSwitch() {
      return killSwitch;
    },
    async setKillSwitch(enabled) {
      killSwitch = enabled;
      return enabled;
    },
    async forceSync() {
      return { jobId: 'forced-1' };
    },
  };
  const forbidden = await callWithOptions({
    path: '/api/v1/admin/sync/status',
    method: 'GET',
    accounts: accountRepository(),
    queue: queue([]),
    admin,
  });
  assert.equal(forbidden.statusCode, 403);

  assert.equal(forbidden.json.error.code, 'FORBIDDEN');
});

test('profile updates are scoped to the authenticated user', async () => {
  let updatedInput: { displayName?: string } | undefined;
  const response = await callWithOptions({
    path: '/api/v1/me',
    method: 'PATCH',
    body: { displayName: 'Alex Orbit' },
    accounts: accountRepository(),
    queue: queue([]),
    reminders: undefined,
  });
  assert.equal(response.statusCode, 503);

  const server = createApiServer(config, {
    ...repository(),
    async updateProfile(id, input) {
      assert.equal(id, user.id);
      updatedInput = input;
      return { ...user, displayName: input.displayName ?? user.displayName };
    },
  });
  server.listen(0);
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address === 'object');
  const responseFromServer = await new Promise<number>((resolve, reject) => {
    const req = request(
      {
        hostname: '127.0.0.1',
        port: address.port,
        path: '/api/v1/me',
        method: 'PATCH',
        headers: {
          authorization: `Bearer ${token({ sub: user.id, role: 'user' })}`,
          'content-type': 'application/json',
        },
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode ?? 0));
      },
    );
    req.on('error', reject);
    req.end(JSON.stringify({ displayName: 'Alex Orbit' }));
  });
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  assert.equal(responseFromServer, 200);
  assert.deepEqual(updatedInput, { displayName: 'Alex Orbit' });
});

test('contest reminders can be replaced and are scoped to the authenticated user', async () => {
  const calls: Array<{ userId: string; contestId: string; offsets: number[] }> = [];
  const response = await callWithOptions({
    path: '/api/v1/contests/contest-1/reminders',
    method: 'PUT',
    body: { offsets: [30, 1440] },
    accounts: accountRepository(),
    queue: queue([]),
    reminders: {
      async listByUser() {
        return [];
      },
      async replaceForUser(userId, contestId, offsets) {
        calls.push({ userId, contestId, offsets });
        return offsets.map((offsetMinutes) => ({
          contestId,
          platform: 'codeforces' as const,
          contestName: 'Round 1',
          contestUrl: 'https://example.com/round-1',
          startsAt: '2026-10-07T12:00:00.000Z',
          offsetMinutes,
        }));
      },
    },
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(calls, [{ userId: user.id, contestId: 'contest-1', offsets: [30, 1440] }]);
  assert.equal(response.json.reminders.length, 2);
});

test('contest reminders reject unsupported offsets', async () => {
  const response = await callWithOptions({
    path: '/api/v1/contests/contest-1/reminders',
    method: 'PUT',
    body: { offsets: [7] },
    accounts: accountRepository(),
    queue: queue([]),
    reminders: {
      async listByUser() {
        return [];
      },
      async replaceForUser() {
        return [];
      },
    },
  });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json.error.code, 'VALIDATION_ERROR');
});

test('session sync requires the internal API secret and upserts the user', async () => {
  const server = createApiServer(config, repository());
  server.listen(0);
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address === 'object');

  const response = await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
    const requestInstance = request(
      {
        hostname: '127.0.0.1',
        port: address.port,
        path: '/auth/session-sync',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-api-secret': config.internalApiSecret,
        },
      },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => (body += chunk));
        response.on('end', () => resolve({ statusCode: response.statusCode ?? 0, body }));
      },
    );
    requestInstance.on('error', reject);
    requestInstance.end(JSON.stringify(user));
  });

  test('account linking validates the handle and enqueues an initial sync', async () => {
    const accounts: Account[] = [];
    const jobs: string[] = [];
    const response = await callWithOptions({
      path: '/api/v1/accounts',
      method: 'POST',
      body: { platform: 'codeforces', handle: 'tourist' },
      accounts: accountRepository(accounts),
      adapters: new Map([['codeforces', adapter()]]),
      queue: queue(jobs),
    });
    assert.equal(response.statusCode, 201);
    assert.equal(response.json.account.handle, 'tourist');
    assert.deepEqual(jobs, ['link:00000000-0000-0000-0000-000000000456']);
  });

  test('account listing is scoped to the authenticated user', async () => {
    const accounts: Account[] = [
      {
        id: 'account-1',
        userId: user.id,
        platform: 'codeforces',
        handle: 'tourist',
        status: 'ok',
      },
      {
        id: 'account-2',
        userId: 'other-user',
        platform: 'leetcode',
        handle: 'hidden',
        status: 'ok',
      },
    ];
    const response = await callWithOptions({
      path: '/api/v1/accounts',
      method: 'GET',
      accounts: accountRepository(accounts),
      queue: queue([]),
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(
      response.json.accounts.map((account: Account) => account.id),
      ['account-1'],
    );
  });

  test('manual sync returns a cooldown error after a recent sync', async () => {
    const response = await callWithOptions({
      path: '/api/v1/accounts/account-1/sync',
      method: 'POST',
      accounts: accountRepository([
        {
          id: 'account-1',
          userId: user.id,
          platform: 'codeforces',
          handle: 'tourist',
          status: 'ok',
          lastSyncedAt: new Date().toISOString(),
        },
      ]),
      adapters: new Map([['codeforces', adapter()]]),
      queue: queue([]),
    });
    assert.equal(response.statusCode, 429);
    assert.equal(response.json.error.code, 'SYNC_COOLDOWN');
  });

  test('account deletion is scoped to the authenticated user', async () => {
    const response = await callWithOptions({
      path: '/api/v1/accounts/other-account',
      method: 'DELETE',
      accounts: accountRepository([
        {
          id: 'other-account',
          userId: 'other-user',
          platform: 'codeforces',
          handle: 'tourist',
          status: 'ok',
        },
      ]),
      queue: queue([]),
    });
    assert.equal(response.statusCode, 404);
    assert.equal(response.json.error.code, 'ACCOUNT_NOT_FOUND');
  });

  test('dashboard summary is scoped to the authenticated user', async () => {
    const response = await callWithOptions({
      path: '/api/v1/dashboard',
      method: 'GET',
      accounts: accountRepository(),
      queue: queue([]),
      dashboard: {
        async getDashboardData(userId) {
          assert.equal(userId, user.id);
          return {
            solvedByDifficulty: { easy: 1, medium: 2, hard: 3, unrated: 0 },
            activity: [{ day: new Date().toISOString().slice(0, 10), submissions: 4, accepted: 2 }],
            platforms: [
              {
                platform: 'codeforces',
                handle: 'tourist',
                totalSolved: 6,
                rating: 3000,
              },
            ],
          };
        },
      },
    });

    test('heatmap endpoint returns a complete UTC-day range and platform filter', async () => {
      const response = await callWithOptions({
        path: '/api/v1/dashboard/heatmap?from=2026-10-01&to=2026-10-03&platform=codeforces',
        method: 'GET',
        accounts: accountRepository(),
        queue: queue([]),
        heatmap: {
          async getHeatmapData(userId, range, platform) {
            assert.equal(userId, user.id);
            assert.deepEqual(range, { from: '2026-10-01', to: '2026-10-03' });
            assert.equal(platform, 'codeforces');
            return [{ day: '2026-10-02', submissions: 2, accepted: 1 }];
          },
        },
      });
      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.json.activity, [
        { day: '2026-10-01', submissions: 0, accepted: 0 },
        { day: '2026-10-02', submissions: 2, accepted: 1 },
        { day: '2026-10-03', submissions: 0, accepted: 0 },
      ]);
    });

    test('heatmap endpoint rejects invalid platform and oversized range', async () => {
      const options = {
        accounts: accountRepository(),
        queue: queue([]),
        heatmap: {
          async getHeatmapData() {
            return [];
          },
        },
      };
      const invalidPlatform = await callWithOptions({
        ...options,
        path: '/api/v1/dashboard/heatmap?platform=unknown',
        method: 'GET',
      });

      test('charts endpoint returns user-scoped chart data and validates range', async () => {
        const response = await callWithOptions({
          path: '/api/v1/dashboard/charts?months=6',
          method: 'GET',
          accounts: accountRepository(),
          queue: queue([]),
          charts: {
            async getCharts(userId, months) {
              assert.equal(userId, user.id);
              assert.equal(months, 6);
              return {
                difficulty: [{ difficulty: 'easy', solved: 3 }],
                topics: [],
                rating: [],
                monthly: [],
              };
            },
          },
        });

        test('contests endpoint filters by platform and supports calendar export', async () => {
          const contest = {
            id: 'contest-1',
            platform: 'codeforces' as const,
            externalId: 'round-1',
            name: 'Round 1',
            url: 'https://codeforces.com/contests/1',
            startsAt: '2026-10-10T10:00:00.000Z',
            endsAt: '2026-10-10T12:00:00.000Z',
            source: 'codeforces' as const,
          };
          const contests: ContestRepository = {
            async listUpcoming(input) {
              assert.equal(input.platform, 'codeforces');
              return [contest];
            },
          };
          const json = await callWithOptions({
            path: '/api/v1/contests?platform=codeforces&from=2026-10-07T00:00:00Z&to=2026-10-20T00:00:00Z',
            method: 'GET',
            accounts: accountRepository(),
            queue: queue([]),
            contests,
          });
          assert.equal(json.statusCode, 200);
          assert.equal(json.json.contests[0].name, 'Round 1');

          const ics = await callWithOptions({
            path: '/api/v1/contests.ics?platform=codeforces',
            method: 'GET',
            accounts: accountRepository(),
            queue: queue([]),
            contests,
          });
          assert.equal(ics.statusCode, 200);
          assert.match(ics.body, /BEGIN:VCALENDAR/);
          assert.match(ics.body, /SUMMARY:Round 1/);
        });
        assert.equal(response.statusCode, 200);
        assert.deepEqual(response.json.charts.difficulty, [{ difficulty: 'easy', solved: 3 }]);

        const invalid = await callWithOptions({
          path: '/api/v1/dashboard/charts?months=25',
          method: 'GET',
          accounts: accountRepository(),
          queue: queue([]),
          charts: {
            async getCharts() {
              return { difficulty: [], topics: [], rating: [], monthly: [] };
            },
          },
        });
        assert.equal(invalid.statusCode, 400);
      });
      assert.equal(invalidPlatform.statusCode, 400);
      const oversized = await callWithOptions({
        ...options,
        path: '/api/v1/dashboard/heatmap?from=2025-01-01&to=2026-01-02',
        method: 'GET',
      });
      assert.equal(oversized.statusCode, 400);
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json.dashboard.totalSolved, 6);
    assert.equal(response.json.dashboard.currentStreak, 1);
    assert.equal(response.json.dashboard.platforms[0].handle, 'tourist');
  });

  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), { user });
});
