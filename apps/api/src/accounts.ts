import type { PlatformAdapter } from '@codeorbit/adapters';
import type { PlatformId } from '@codeorbit/shared';

export interface Account {
  id: string;
  userId: string;
  platform: PlatformId;
  handle: string;
  status: 'pending' | 'syncing' | 'ok' | 'failed';
  lastSyncedAt?: string;
  lastError?: string;
}

export interface AccountRepository {
  listByUser(userId: string): Promise<Account[]>;
  create(input: { userId: string; platform: PlatformId; handle: string }): Promise<Account>;
  delete(accountId: string, userId: string): Promise<boolean>;
  getById(accountId: string, userId: string): Promise<Account | undefined>;
  markPending(accountId: string): Promise<void>;
}

export interface SyncQueue {
  enqueue(input: {
    accountId: string;
    platform: PlatformId;
    trigger: 'link' | 'manual' | 'scheduled';
  }): Promise<{ jobId: string }>;
}

export type AdapterRegistry = ReadonlyMap<PlatformId, PlatformAdapter>;

export const MANUAL_SYNC_COOLDOWN_MS = 60_000;

export function platformQueueName(platform: PlatformId): string {
  return `sync-${platform}`;
}
