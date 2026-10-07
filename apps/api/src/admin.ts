import type { PlatformId } from '@codeorbit/shared';

export interface QueueStats {
  name: string;
  waiting: number;
  active: number;
  failed: number;
  delayed: number;
}

export interface AdminSyncControl {
  getQueueStats(): Promise<QueueStats[]>;
  getKillSwitch(): Promise<boolean>;
  setKillSwitch(enabled: boolean): Promise<boolean>;
  forceSync(input: { accountId: string; platform: PlatformId }): Promise<{ jobId: string }>;
}

export function isAdmin(role: unknown): boolean {
  return role === 'admin';
}
