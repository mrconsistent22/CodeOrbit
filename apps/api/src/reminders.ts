import type { PlatformId } from '@codeorbit/shared';

export const REMINDER_OFFSETS = [5, 30, 60, 1440] as const;
export type ReminderOffsetMinutes = (typeof REMINDER_OFFSETS)[number];

export interface ContestReminder {
  contestId: string;
  platform: PlatformId;
  contestName: string;
  contestUrl: string;
  startsAt: string;
  offsetMinutes: ReminderOffsetMinutes;
}

export interface ReminderRepository {
  listByUser(userId: string, contestId: string): Promise<ContestReminder[]>;
  replaceForUser(
    userId: string,
    contestId: string,
    offsets: ReminderOffsetMinutes[],
  ): Promise<ContestReminder[]>;
}

export function parseReminderOffsets(value: unknown): ReminderOffsetMinutes[] {
  if (!Array.isArray(value) || value.some((item) => !REMINDER_OFFSETS.includes(item))) {
    throw new Error(`Reminder offsets must be selected from: ${REMINDER_OFFSETS.join(', ')}`);
  }
  return [...new Set(value)] as ReminderOffsetMinutes[];
}

export function reminderPath(url: string | undefined): string | undefined {
  const parts = new URL(url ?? '/', 'http://localhost').pathname.split('/').filter(Boolean);
  if (parts.length !== 5 || parts[0] !== 'api' || parts[1] !== 'v1' || parts[2] !== 'contests') {
    return undefined;
  }
  if (parts[4] !== 'reminders' || !parts[3]) return undefined;
  return parts[3];
}
