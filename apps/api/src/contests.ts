import type { PlatformId } from '@codeorbit/shared';

export interface Contest {
  id: string;
  platform: PlatformId;
  externalId: string;
  name: string;
  url: string;
  startsAt: string;
  endsAt: string;
  source: 'clist' | 'codeforces';
}

export interface ContestRepository {
  listUpcoming(input: { from: string; to: string; platform?: PlatformId }): Promise<Contest[]>;
}

export function normalizeContestWindow(
  from: string | null,
  to: string | null,
  now = new Date(),
): { from: string; to: string } {
  const start = from ? new Date(from) : now;
  const end = to ? new Date(to) : new Date(start.getTime() + 45 * 86_400_000);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
    throw new Error('Contest window must contain valid dates with from before to');
  }
  if (end.getTime() - start.getTime() > 45 * 86_400_000) {
    throw new Error('Contest window cannot exceed 45 days');
  }
  return { from: start.toISOString(), to: end.toISOString() };
}

function escapeIcs(value: string): string {
  return value.replace(/([\\;,])/g, '\\$1').replace(/\r?\n/g, '\\n');
}

function icsDate(value: string): string {
  return value.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function contestsToIcs(contests: Contest[], generatedAt = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CodeOrbit//Contest Calendar//EN',
    'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:CodeOrbit contests',
  ];
  for (const contest of contests) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${escapeIcs(`${contest.platform}-${contest.externalId}@codeorbit`)}`,
      `DTSTAMP:${icsDate(generatedAt.toISOString())}`,
      `DTSTART:${icsDate(contest.startsAt)}`,
      `DTEND:${icsDate(contest.endsAt)}`,
      `SUMMARY:${escapeIcs(contest.name)}`,
      `DESCRIPTION:${escapeIcs(`${contest.platform} contest`)}`,
      `URL:${contest.url}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}
