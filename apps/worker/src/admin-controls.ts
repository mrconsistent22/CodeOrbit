import type { Queue } from 'bullmq';
import type { PlatformId, QueueName } from '@codeorbit/shared';

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

export interface AdminQueueMap {
  queues: Map<QueueName, Queue>;
}

export function createAdminSyncControl(runtime: AdminQueueMap): AdminSyncControl {
  let killSwitch = false;
  return {
    async getQueueStats(): Promise<QueueStats[]> {
      const stats: QueueStats[] = [];
      for (const queue of runtime.queues.values()) {
        const counts = await queue.getJobCounts('waiting', 'active', 'failed', 'delayed');
        stats.push({
          name: queue.name,
          waiting: counts.waiting ?? 0,
          active: counts.active ?? 0,
          failed: counts.failed ?? 0,
          delayed: counts.delayed ?? 0,
        });
      }
      return stats;
    },
    async getKillSwitch() {
      return killSwitch;
    },
    async setKillSwitch(enabled) {
      killSwitch = enabled;
      return killSwitch;
    },
    async forceSync({ accountId, platform }) {
      const queue = runtime.queues.get(`sync-${platform}` as QueueName);
      if (!queue) throw new Error(`No queue configured for ${platform as PlatformId}`);
      const job = await queue.add('force-sync', { accountId, platform, trigger: 'manual' });
      return { jobId: job.id ?? `${platform}-${accountId}` };
    },
  };
}
