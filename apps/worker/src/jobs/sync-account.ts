import {
  AdapterError,
  type NormalizedProblemRef,
  type PlatformAdapter,
  type SyncCursor,
  type SyncResult,
} from '@codeorbit/adapters';
import type { Job, Processor } from 'bullmq';

export type SyncTrigger = 'link' | 'manual' | 'scheduled';

export interface SyncAccountJobData {
  accountId: string;
  trigger: SyncTrigger;
}

export interface SyncAccount {
  id: string;
  userId: string;
  platform: string;
  handle: string;
  status: 'pending' | 'syncing' | 'ok' | 'failed';
  syncCursor?: SyncCursor;
}

export interface SyncTransaction {
  upsertProblem(problem: NormalizedProblemRef): Promise<string>;
  insertSubmission(input: {
    externalId: string;
    problemId: string;
    verdict: SyncResult['submissions'][number]['verdict'];
    language?: string;
    submittedAt: string;
  }): Promise<void>;
  upsertActivity(input: { day: string; submissions: number; accepted: number }): Promise<void>;
  upsertRating(input: SyncResult['ratingHistory'][number]): Promise<void>;
  upsertSolvedProblem(input: {
    problemId: string;
    firstSolvedAt: string;
    accountId: string;
    userId: string;
  }): Promise<void>;
  upsertPlatformStats(profile: SyncResult['profile']): Promise<void>;
  completeAccount(input: { cursor?: SyncCursor; syncedAt: string }): Promise<void>;
}

export interface SyncAccountRepository {
  getAccount(accountId: string): Promise<SyncAccount | null>;
  markSyncing(accountId: string): Promise<void>;
  markFailed(accountId: string, error: { code: string; message: string }): Promise<void>;
  transaction<T>(callback: (transaction: SyncTransaction) => Promise<T>): Promise<T>;
  startSyncJob(input: { accountId: string; trigger: SyncTrigger }): Promise<string>;
  finishSyncJob(
    syncJobId: string,
    result: {
      status: 'ok' | 'failed';
      itemsFetched: number;
      errorCode?: string;
      errorDetail?: string;
    },
  ): Promise<void>;
}

export interface SyncCache {
  invalidateUser(userId: string): Promise<void>;
}

export interface SyncKillSwitch {
  isEnabled(): Promise<boolean>;
}

export interface SyncAccountDependencies {
  repository: SyncAccountRepository;
  adapters: ReadonlyMap<string, PlatformAdapter>;
  cache?: SyncCache;
  killSwitch?: SyncKillSwitch;
  now?: () => Date;
}

export function createSyncAccountProcessor(
  dependencies: SyncAccountDependencies,
): Processor<SyncAccountJobData> {
  return async (job: Job<SyncAccountJobData>) => processSyncAccount(job.data, dependencies);
}

export class RetryableSyncError extends Error {
  constructor(
    message: string,
    public readonly retryAfterMs: number,
  ) {
    super(message);
    this.name = 'RetryableSyncError';
  }
}

const RETRY_DELAYS_MS = [60_000, 300_000, 1_800_000] as const;

export function syncRetryDelay(attempt: number): number | null {
  if (attempt < 1 || attempt > RETRY_DELAYS_MS.length) {
    return null;
  }
  return RETRY_DELAYS_MS[attempt - 1] ?? null;
}

export function shouldRetryAdapterError(code: AdapterError['code']): boolean {
  return code === 'RATE_LIMITED' || code === 'NETWORK';
}

function friendlyAdapterMessage(error: AdapterError): string {
  switch (error.code) {
    case 'NOT_FOUND':
      return 'The platform profile could not be found.';
    case 'PRIVATE_PROFILE':
      return 'The platform profile is not publicly readable.';
    case 'RATE_LIMITED':
      return 'The platform temporarily rate-limited synchronization.';
    case 'NETWORK':
      return 'The platform could not be reached.';
    case 'UPSTREAM_CHANGED':
      return 'The platform response changed and needs review.';
    case 'DISABLED':
      return 'Synchronization for this platform is disabled.';
    default:
      return 'Synchronization failed.';
  }
}

function problemRefs(result: SyncResult): NormalizedProblemRef[] {
  const byKey = new Map<string, NormalizedProblemRef>();
  for (const submission of result.submissions) {
    byKey.set(`${submission.problem.platform}:${submission.problem.slug}`, submission.problem);
  }
  return [...byKey.values()];
}

export async function processSyncAccount(
  data: SyncAccountJobData,
  dependencies: SyncAccountDependencies,
): Promise<{ syncJobId: string; itemsFetched: number }> {
  if (dependencies.killSwitch && (await dependencies.killSwitch.isEnabled())) {
    throw new Error('Sync processing is disabled by the administrator');
  }
  const account = await dependencies.repository.getAccount(data.accountId);
  if (!account) {
    throw new Error(`Sync account ${data.accountId} was not found`);
  }

  const syncJobId = await dependencies.repository.startSyncJob({
    accountId: account.id,
    trigger: data.trigger,
  });
  const adapter = dependencies.adapters.get(account.platform);
  if (!adapter) {
    const error = new AdapterError('DISABLED', `Adapter ${account.platform} is disabled`);
    await dependencies.repository.markFailed(account.id, {
      code: error.code,
      message: friendlyAdapterMessage(error),
    });
    await dependencies.repository.finishSyncJob(syncJobId, {
      status: 'failed',
      itemsFetched: 0,
      errorCode: error.code,
      errorDetail: error.message,
    });
    return { syncJobId, itemsFetched: 0 };
  }

  await dependencies.repository.markSyncing(account.id);
  try {
    const result = await adapter.sync(account.handle, account.syncCursor);
    const syncedAt = (dependencies.now ?? (() => new Date()))().toISOString();
    const refs = problemRefs(result);
    await dependencies.repository.transaction(async (transaction) => {
      const problemIds = new Map<string, string>();
      for (const problem of refs) {
        problemIds.set(
          `${problem.platform}:${problem.slug}`,
          await transaction.upsertProblem(problem),
        );
      }
      for (const submission of result.submissions) {
        const problemId = problemIds.get(
          `${submission.problem.platform}:${submission.problem.slug}`,
        );
        if (!problemId) {
          throw new Error(`Missing problem for submission ${submission.externalId}`);
        }
        await transaction.insertSubmission({
          externalId: submission.externalId,
          problemId,
          verdict: submission.verdict,
          ...(submission.language === undefined ? {} : { language: submission.language }),
          submittedAt: submission.submittedAt,
        });
        if (submission.verdict === 'accepted') {
          await transaction.upsertSolvedProblem({
            problemId,
            firstSolvedAt: submission.submittedAt,
            accountId: account.id,
            userId: account.userId,
          });
        }
      }
      for (const activity of result.activity) {
        await transaction.upsertActivity(activity);
      }
      for (const rating of result.ratingHistory) {
        await transaction.upsertRating(rating);
      }
      await transaction.upsertPlatformStats(result.profile);
      await transaction.completeAccount({
        ...(result.nextCursor === undefined ? {} : { cursor: result.nextCursor }),
        syncedAt,
      });
    });
    await dependencies.cache?.invalidateUser(account.userId);
    await dependencies.repository.finishSyncJob(syncJobId, {
      status: 'ok',
      itemsFetched: result.submissions.length,
    });
    return { syncJobId, itemsFetched: result.submissions.length };
  } catch (cause) {
    if (!(cause instanceof AdapterError)) {
      const message = cause instanceof Error ? cause.message : 'Sync persistence failed';
      await dependencies.repository.markFailed(account.id, {
        code: 'PERSISTENCE_ERROR',
        message: 'Synchronization could not be saved.',
      });
      await dependencies.repository.finishSyncJob(syncJobId, {
        status: 'failed',
        itemsFetched: 0,
        errorCode: 'PERSISTENCE_ERROR',
        errorDetail: message,
      });
      throw cause;
    }
    const error = cause;
    await dependencies.repository.markFailed(account.id, {
      code: error.code,
      message: friendlyAdapterMessage(error),
    });
    await dependencies.repository.finishSyncJob(syncJobId, {
      status: 'failed',
      itemsFetched: 0,
      errorCode: error.code,
      errorDetail: error.message,
    });
    if (shouldRetryAdapterError(error.code)) {
      const retryAfterMs = error.retryAfterMs ?? RETRY_DELAYS_MS[0];
      throw new RetryableSyncError(error.message, retryAfterMs);
    }
    return { syncJobId, itemsFetched: 0 };
  }
}
