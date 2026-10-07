import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { once } from 'node:events';
import { request } from 'node:http';
import test from 'node:test';
import { createApiServer } from '../src/main.js';
import type { AppConfig } from '@codeorbit/config';
import type { Account, AccountRepository, SyncQueue } from '../src/accounts.js';
import type { DashboardRepository } from '../src/dashboard.js';
import type { PlatformAdapter } from '@codeorbit/adapters';

const config: AppConfig = {
  nodeEnv: 'test',
  apiPort: 0,
  databaseUrl: 'postgresql://localhost/test',
  redisUrl: 'redis://localhost:6379',
  authSecret: 'test-secret',
  apiJwtSecret: 'test-jwt-secret',
  internalApiSecret: 'test-internal-secret',
  webOrigin: 'http://localhost:3000',
  enableCodeChefAdapter: false,
  enableGfgAdapter: false,
};
const userId = '00000000-0000-0000-0000-000000000123';

function token(): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({ sub: userId, role: 'user' });
  const signature = createHmac('sha256', config.apiJwtSecret)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}

async function http(
  port: number,
  path: string,
  method: string,
  body?: unknown,
): Promise<{ status: number; json: Record<string, any> }> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          authorization: `Bearer ${token()}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
      },
      (response) => {
        let text = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => (text += chunk));
        response.on('end', () =>
          resolve({ status: response.statusCode ?? 0, json: JSON.parse(text || '{}') }),
        );
      },
    );
    req.on('error', reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

test('full happy path links an account, syncs, reads dashboard, and configures reminders', async () => {
  const accounts: Account[] = [];
  const jobs: string[] = [];
  const accountRepository: AccountRepository = {
    async listByUser(id) {
      return accounts.filter((account) => account.userId === id);
    },
    async create(input) {
      const account: Account = { id: 'account-1', ...input, status: 'pending' };
      accounts.push(account);
      return account;
    },
    async delete() {
      return false;
    },
    async getById(id, userId) {
      return accounts.find((account) => account.id === id && account.userId === userId);
    },
    async markPending(id) {
      const account = accounts.find((item) => item.id === id);
      if (account) account.status = 'pending';
    },
  };
  const syncQueue: SyncQueue = {
    async enqueue(input) {
      jobs.push(input.trigger);
      return { jobId: 'sync-1' };
    },
  };
  const adapter: PlatformAdapter = {
    id: 'codeforces',
    capabilities: {
      fullSubmissionHistory: true,
      dailyActivityCalendar: false,
      ratingHistory: true,
      problemMetadataLookup: false,
    },
    async validateHandle() {
      return { exists: true, canonicalHandle: 'tourist' };
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
  const dashboard: DashboardRepository = {
    async getDashboardData(id) {
      assert.equal(id, userId);
      return {
        solvedByDifficulty: { easy: 1, medium: 2, hard: 0, unrated: 0 },
        activity: [{ day: '2026-10-07', submissions: 3, accepted: 2 }],
        platforms: [{ platform: 'codeforces', handle: 'tourist', totalSolved: 3 }],
      };
    },
  };
  const reminders = {
    async listByUser() {
      return [];
    },
    async replaceForUser(_userId: string, contestId: string, offsets: [5, 30, 60, 1440][number][]) {
      return offsets.map((offsetMinutes) => ({
        contestId,
        platform: 'codeforces' as const,
        contestName: 'Round 1',
        contestUrl: 'https://example.com/round-1',
        startsAt: '2026-10-08T12:00:00.000Z',
        offsetMinutes,
      }));
    },
  };
  const server = createApiServer(
    config,
    {
      async upsertFromSession(value) {
        return value;
      },
      async findById(id) {
        return id === userId
          ? { id, email: 'alex@example.com', username: 'alex', displayName: 'Alex' }
          : undefined;
      },
    },
    accountRepository,
    new Map([['codeforces', adapter]]),
    syncQueue,
    dashboard,
    undefined,
    undefined,
    undefined,
    reminders,
  );
  server.listen(0);
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address === 'object');
  const linked = await http(address.port, '/api/v1/accounts', 'POST', {
    platform: 'codeforces',
    handle: 'tourist',
  });
  assert.equal(linked.status, 201);
  assert.deepEqual(jobs, ['link']);
  const dashboardResponse = await http(address.port, '/api/v1/dashboard', 'GET');
  assert.equal(dashboardResponse.status, 200);
  assert.equal(dashboardResponse.json.dashboard.totalSolved, 3);
  const configured = await http(address.port, '/api/v1/contests/contest-1/reminders', 'PUT', {
    offsets: [30],
  });
  assert.equal(configured.status, 200);
  assert.equal(configured.json.reminders.length, 1);
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});
