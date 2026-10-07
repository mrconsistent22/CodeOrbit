import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { getConfig, type AppConfig } from '@codeorbit/config';
import { verifyJwt, type JwtClaims } from './auth.js';
import { ApiError, internalError, sendError } from './errors.js';
import {
  DatabaseUnavailableError,
  UnconfiguredUserRepository,
  type SessionUser,
  type UserRepository,
} from './users.js';
import { pino } from 'pino';
import { z } from 'zod';
import { PLATFORM_IDS, type PlatformId } from '@codeorbit/shared';
import {
  MANUAL_SYNC_COOLDOWN_MS,
  type AccountRepository,
  type AdapterRegistry,
  type SyncQueue,
} from './accounts.js';
import {
  buildDashboardData,
  buildHeatmapData,
  normalizeHeatmapRange,
  type DashboardRepository,
  type HeatmapRepository,
} from './dashboard.js';
import { normalizeChartMonths, sortChartData, type ChartsRepository } from './charts.js';
import { contestsToIcs, normalizeContestWindow, type ContestRepository } from './contests.js';
import { parseReminderOffsets, reminderPath, type ReminderRepository } from './reminders.js';
import { isAdmin, type AdminSyncControl } from './admin.js';

export interface ApiRequest extends IncomingMessage {
  auth?: JwtClaims;
}

const logger = pino({ name: 'codeorbit-api' });
const sessionUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  username: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[a-z0-9_-]+$/),
  displayName: z.string().min(1).max(120),
  avatarUrl: z.string().url().optional(),
});
const accountSchema = z.object({
  platform: z.enum(PLATFORM_IDS),
  handle: z.string().trim().min(1).max(100),
});
const profileSchema = z
  .object({
    displayName: z.string().trim().min(1).max(120).optional(),
    username: z
      .string()
      .trim()
      .min(3)
      .max(30)
      .regex(/^[a-z0-9_-]+$/)
      .optional(),
    timezone: z.string().trim().min(1).max(100).optional(),
    bio: z.string().trim().max(500).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one profile field is required');
const onboardingSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  username: z
    .string()
    .trim()
    .min(3)
    .max(30)
    .regex(/^[a-z0-9_-]+$/),
  timezone: z.string().trim().min(1).max(100),
  bio: z.string().trim().max(500).optional(),
});

function bearerToken(request: IncomingMessage): string | undefined {
  const value = request.headers.authorization;
  if (!value?.startsWith('Bearer ')) return undefined;
  return value.slice('Bearer '.length).trim() || undefined;
}

function authenticate(request: ApiRequest, config: AppConfig): void {
  const token = bearerToken(request);
  if (!token) throw new ApiError(401, 'UNAUTHORIZED', 'A valid bearer token is required');

  try {
    request.auth = verifyJwt(token, config.apiJwtSecret);
  } catch {
    throw new ApiError(401, 'UNAUTHORIZED', 'A valid bearer token is required');
  }
}

function writeJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 32_768) throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
    chunks.push(buffer);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ApiError(400, 'INVALID_JSON', 'Request body must be valid JSON');
  }
}

function requireInternalSecret(request: IncomingMessage, config: AppConfig): void {
  if (request.headers['x-internal-api-secret'] !== config.internalApiSecret) {
    throw new ApiError(401, 'UNAUTHORIZED', 'A valid internal API secret is required');
  }
}

function pathParts(url: string | undefined): string[] {
  return new URL(url ?? '/', 'http://localhost').pathname.split('/').filter(Boolean);
}

function accountRouteId(
  url: string | undefined,
): { accountId: string; action?: 'sync' } | undefined {
  const parts = pathParts(url);
  if (parts.length < 4 || parts[0] !== 'api' || parts[1] !== 'v1' || parts[2] !== 'accounts') {
    return undefined;
  }
  if (!parts[3]) return undefined;
  return {
    accountId: parts[3],
    ...(parts[4] === 'sync' ? { action: 'sync' } : {}),
  };
}

export function createApiServer(
  config: AppConfig = getConfig(),
  users: UserRepository = new UnconfiguredUserRepository(),
  accounts?: AccountRepository,
  adapters: AdapterRegistry = new Map(),
  syncQueue?: SyncQueue,
  dashboard?: DashboardRepository,
  heatmap?: HeatmapRepository,
  charts?: ChartsRepository,
  contests?: ContestRepository,
  reminders?: ReminderRepository,
  admin?: AdminSyncControl,
) {
  return createServer(async (request, response) => {
    const startedAt = process.hrtime.bigint();
    const apiRequest = request as ApiRequest;

    response.once('finish', () => {
      logger.info(
        {
          method: request.method,
          path: request.url,
          statusCode: response.statusCode,
          durationMs: Number(process.hrtime.bigint() - startedAt) / 1_000_000,
        },
        'request completed',
      );
    });

    try {
      if (request.method === 'GET' && request.url === '/health') {
        writeJson(response, 200, { status: 'ok', service: 'api' });
        return;
      }

      if (
        request.method === 'GET' &&
        (request.url?.split('?')[0] === '/api/v1/contests' ||
          request.url?.split('?')[0] === '/api/v1/contests.ics')
      ) {
        authenticate(apiRequest, config);
        if (!contests) throw new DatabaseUnavailableError();
        const query = new URL(request.url, 'http://localhost').searchParams;
        const platform = query.get('platform');
        if (platform !== null && !PLATFORM_IDS.includes(platform as PlatformId)) {
          throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid contest platform');
        }
        let window: { from: string; to: string };
        try {
          window = normalizeContestWindow(query.get('from'), query.get('to'));
        } catch (error) {
          throw new ApiError(
            400,
            'VALIDATION_ERROR',
            error instanceof Error ? error.message : 'Invalid contest window',
          );
        }
        const result = await contests.listUpcoming({
          ...window,
          ...(platform === null ? {} : { platform: platform as PlatformId }),
        });
        if (request.url?.split('?')[0] === '/api/v1/contests.ics') {
          response.writeHead(200, {
            'content-type': 'text/calendar; charset=utf-8',
            'content-disposition': 'attachment; filename="codeorbit-contests.ics"',
          });
          response.end(contestsToIcs(result));
          return;
        }
        writeJson(response, 200, { from: window.from, to: window.to, contests: result });
        return;
      }

      if (request.method === 'GET' && request.url?.split('?')[0] === '/api/v1/dashboard/charts') {
        authenticate(apiRequest, config);
        if (!charts) throw new DatabaseUnavailableError();
        const query = new URL(request.url, 'http://localhost').searchParams;
        let months: number;
        try {
          months = normalizeChartMonths(query.get('months'));
        } catch (error) {
          throw new ApiError(
            400,
            'VALIDATION_ERROR',
            error instanceof Error ? error.message : 'Invalid chart range',
          );
        }
        const data = await charts.getCharts(apiRequest.auth?.sub ?? '', months);
        writeJson(response, 200, { charts: sortChartData(data) });
        return;
      }

      if (request.url?.startsWith('/api/v1/admin/')) {
        authenticate(apiRequest, config);
        if (!isAdmin(apiRequest.auth?.role)) {
          throw new ApiError(403, 'FORBIDDEN', 'Administrator access is required');
        }
        if (!admin) throw new DatabaseUnavailableError();
        const adminPath = request.url.split('?')[0] ?? '';
        if (request.method === 'GET' && adminPath === '/api/v1/admin/sync/status') {
          writeJson(response, 200, {
            killSwitch: await admin.getKillSwitch(),
            queues: await admin.getQueueStats(),
          });
          return;
        }
        if (request.method === 'PUT' && adminPath === '/api/v1/admin/kill-switch') {
          const body = await readJson(request);
          if (typeof (body as { enabled?: unknown })?.enabled !== 'boolean') {
            throw new ApiError(400, 'VALIDATION_ERROR', 'enabled must be a boolean');
          }
          writeJson(response, 200, {
            enabled: await admin.setKillSwitch((body as { enabled: boolean }).enabled),
          });
          return;
        }
        const forceSyncMatch = adminPath.match(/^\/api\/v1\/admin\/accounts\/([^/]+)\/sync$/);
        if (request.method === 'POST' && forceSyncMatch?.[1]) {
          const body = await readJson(request);
          if (!PLATFORM_IDS.includes((body as { platform?: PlatformId })?.platform ?? 'other')) {
            throw new ApiError(400, 'VALIDATION_ERROR', 'A valid platform is required');
          }
          const job = await admin.forceSync({
            accountId: forceSyncMatch[1],
            platform: (body as { platform: PlatformId }).platform,
          });
          writeJson(response, 202, { accountId: forceSyncMatch[1], jobId: job.jobId });
          return;
        }
        throw new ApiError(404, 'NOT_FOUND', 'Admin route not found');
      }

      if (request.method === 'POST' && request.url === '/auth/session-sync') {
        requireInternalSecret(request, config);
        const parsed = sessionUserSchema.safeParse(await readJson(request));
        if (!parsed.success) {
          throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid session user', {
            issues: parsed.error.issues,
          });
        }
        const user = await users.upsertFromSession(parsed.data);
        writeJson(response, 200, { user });
        return;
      }

      if (request.method === 'GET' && request.url === '/api/v1/me') {
        authenticate(apiRequest, config);
        const user = await users.findById(apiRequest.auth?.sub ?? '');
        if (!user) throw new ApiError(404, 'USER_NOT_FOUND', 'Authenticated user was not found');
        writeJson(response, 200, { user });
        return;
      }

      if (request.method === 'POST' && request.url === '/api/v1/onboarding') {
        authenticate(apiRequest, config);
        if (!users.updateProfile) throw new DatabaseUnavailableError();
        const parsed = onboardingSchema.safeParse(await readJson(request));
        if (!parsed.success) {
          throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid onboarding details', {
            issues: parsed.error.issues,
          });
        }
        const updated = await users.updateProfile(apiRequest.auth?.sub ?? '', parsed.data);
        writeJson(response, 200, { user: { ...updated, onboardingCompleted: true } });
        return;
      }

      if (
        request.url === '/api/v1/me' &&
        (request.method === 'PATCH' || request.method === 'DELETE')
      ) {
        authenticate(apiRequest, config);
        const userId = apiRequest.auth?.sub ?? '';
        if (request.method === 'DELETE') {
          if (!users.deleteById) throw new DatabaseUnavailableError();
          const deleted = await users.deleteById(userId);
          if (!deleted)
            throw new ApiError(404, 'USER_NOT_FOUND', 'Authenticated user was not found');
          response.writeHead(204);
          response.end();
          return;
        }
        if (!users.updateProfile) throw new DatabaseUnavailableError();
        const parsed = profileSchema.safeParse(await readJson(request));
        if (!parsed.success) {
          throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid profile details', {
            issues: parsed.error.issues,
          });
        }
        writeJson(response, 200, { user: await users.updateProfile(userId, parsed.data) });
        return;
      }

      if (request.method === 'GET' && request.url?.split('?')[0] === '/api/v1/dashboard') {
        authenticate(apiRequest, config);
        if (!dashboard) throw new DatabaseUnavailableError();
        const data = await dashboard.getDashboardData(apiRequest.auth?.sub ?? '');
        writeJson(response, 200, { dashboard: buildDashboardData(data) });
        return;
      }

      if (request.method === 'GET' && request.url?.split('?')[0] === '/api/v1/dashboard/heatmap') {
        authenticate(apiRequest, config);
        if (!heatmap) throw new DatabaseUnavailableError();
        const query = new URL(request.url, 'http://localhost').searchParams;
        const platform = query.get('platform');
        if (platform !== null && !PLATFORM_IDS.includes(platform as PlatformId)) {
          throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid heatmap platform');
        }
        let range;
        try {
          range = normalizeHeatmapRange(query.get('from'), query.get('to'));
        } catch (error) {
          throw new ApiError(
            400,
            'VALIDATION_ERROR',
            error instanceof Error ? error.message : 'Invalid heatmap range',
          );
        }
        const activity = await heatmap.getHeatmapData(
          apiRequest.auth?.sub ?? '',
          range,
          platform as PlatformId | undefined,
        );
        writeJson(response, 200, {
          from: range.from,
          to: range.to,
          platform,
          activity: buildHeatmapData(activity, range),
        });
        return;
      }

      if (request.method === 'GET' && request.url?.split('?')[0] === '/api/v1/accounts') {
        authenticate(apiRequest, config);
        if (!accounts) throw new DatabaseUnavailableError();
        const result = await accounts.listByUser(apiRequest.auth?.sub ?? '');
        writeJson(response, 200, { accounts: result });
        return;
      }

      const contestReminderId = reminderPath(request.url);
      if (contestReminderId && (request.method === 'GET' || request.method === 'PUT')) {
        authenticate(apiRequest, config);
        if (!reminders) throw new DatabaseUnavailableError();
        if (request.method === 'GET') {
          writeJson(response, 200, {
            reminders: await reminders.listByUser(apiRequest.auth?.sub ?? '', contestReminderId),
          });
          return;
        }
        const body = await readJson(request);
        let offsets;
        try {
          offsets = parseReminderOffsets((body as { offsets?: unknown })?.offsets);
        } catch (error) {
          throw new ApiError(
            400,
            'VALIDATION_ERROR',
            error instanceof Error ? error.message : 'Invalid reminder offsets',
          );
        }
        writeJson(response, 200, {
          reminders: await reminders.replaceForUser(
            apiRequest.auth?.sub ?? '',
            contestReminderId,
            offsets,
          ),
        });
        return;
      }

      if (request.method === 'POST' && request.url?.split('?')[0] === '/api/v1/accounts') {
        authenticate(apiRequest, config);
        if (!accounts || !syncQueue) throw new DatabaseUnavailableError();
        const parsed = accountSchema.safeParse(await readJson(request));
        if (!parsed.success) {
          throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid account details', {
            issues: parsed.error.issues,
          });
        }
        const adapter = adapters.get(parsed.data.platform);
        if (!adapter) {
          throw new ApiError(503, 'ADAPTER_DISABLED', 'This platform is not available');
        }
        let validation: { exists: boolean; canonicalHandle: string };
        try {
          validation = await adapter.validateHandle(parsed.data.handle);
        } catch (error) {
          throw new ApiError(
            502,
            'UPSTREAM_ERROR',
            error instanceof Error ? error.message : 'Platform validation failed',
          );
        }
        if (!validation.exists) {
          throw new ApiError(422, 'HANDLE_NOT_FOUND', 'The platform handle could not be found');
        }
        const account = await accounts.create({
          userId: apiRequest.auth?.sub ?? '',
          platform: parsed.data.platform,
          handle: validation.canonicalHandle,
        });
        await syncQueue.enqueue({
          accountId: account.id,
          platform: account.platform,
          trigger: 'link',
        });
        writeJson(response, 201, { account });
        return;
      }

      const route = accountRouteId(request.url);
      if (route && request.method === 'DELETE' && !route.action) {
        authenticate(apiRequest, config);
        if (!accounts) throw new DatabaseUnavailableError();
        const deleted = await accounts.delete(route.accountId, apiRequest.auth?.sub ?? '');
        if (!deleted) throw new ApiError(404, 'ACCOUNT_NOT_FOUND', 'Account was not found');
        response.writeHead(204);
        response.end();
        return;
      }

      if (route && request.method === 'POST' && route.action === 'sync') {
        authenticate(apiRequest, config);
        if (!accounts || !syncQueue) throw new DatabaseUnavailableError();
        const account = await accounts.getById(route.accountId, apiRequest.auth?.sub ?? '');
        if (!account) throw new ApiError(404, 'ACCOUNT_NOT_FOUND', 'Account was not found');
        if (account.status === 'syncing') {
          throw new ApiError(409, 'SYNC_IN_PROGRESS', 'This account is already syncing');
        }
        const lastSyncedAt = account.lastSyncedAt ? Date.parse(account.lastSyncedAt) : 0;
        const retryAfterMs = Math.max(0, lastSyncedAt + MANUAL_SYNC_COOLDOWN_MS - Date.now());
        if (retryAfterMs > 0) {
          throw new ApiError(
            429,
            'SYNC_COOLDOWN',
            'Please wait before syncing this account again',
            {
              retryAfterMs,
            },
          );
        }
        await accounts.markPending(account.id);
        const job = await syncQueue.enqueue({
          accountId: account.id,
          platform: account.platform,
          trigger: 'manual',
        });
        writeJson(response, 202, { accountId: account.id, jobId: job.jobId });
        return;
      }

      sendError(response, new ApiError(404, 'NOT_FOUND', 'Route not found'));
    } catch (error) {
      if (error instanceof ApiError) {
        sendError(response, error);
        return;
      }

      if (error instanceof DatabaseUnavailableError) {
        sendError(response, new ApiError(503, 'DATABASE_UNAVAILABLE', error.message));
        return;
      }
      logger.error({ err: error }, 'unhandled request error');
      sendError(response, internalError(error));
    }
  });
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '')) {
  const config = getConfig();
  createApiServer(config).listen(config.apiPort, () => {
    logger.info({ port: config.apiPort }, 'CodeOrbit API listening');
  });
}
