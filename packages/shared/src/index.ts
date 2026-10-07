export const PLATFORM_IDS = ['leetcode', 'codeforces', 'codechef', 'gfg', 'other'] as const;
export type PlatformId = (typeof PLATFORM_IDS)[number];

export const QUEUE_NAMES = {
  syncCodeforces: 'sync-codeforces',
  syncLeetcode: 'sync-leetcode',
  syncCodechef: 'sync-codechef',
  syncGfg: 'sync-gfg',
  contests: 'contests',
  reminders: 'reminders',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const SYNC_STATUSES = ['pending', 'syncing', 'ok', 'failed'] as const;
export type SyncStatus = (typeof SYNC_STATUSES)[number];
