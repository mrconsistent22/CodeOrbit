import type { PlatformId } from '@codeorbit/shared';

export interface ContestRecord {
  platform: PlatformId;
  externalId: string;
  name: string;
  url: string;
  startsAt: string;
  endsAt: string;
  source: 'clist' | 'codeforces';
}

export interface ContestSource {
  fetchUpcoming(input: { from: string; to: string }): Promise<ContestRecord[]>;
}

export interface ContestIngestionRepository {
  upsertContest(contest: ContestRecord): Promise<void>;
  markMissingFutureContests(input: { seenKeys: string[]; from: string }): Promise<number>;
}

export async function ingestContests(
  source: ContestSource,
  repository: ContestIngestionRepository,
  now = new Date(),
): Promise<{ fetched: number; removedCandidates: number }> {
  const from = now.toISOString();
  const to = new Date(now.getTime() + 45 * 86_400_000).toISOString();
  const contests = await source.fetchUpcoming({ from, to });
  const seenKeys: string[] = [];
  for (const contest of contests) {
    const startsAt = new Date(contest.startsAt);
    const endsAt = new Date(contest.endsAt);
    if (
      !contest.externalId ||
      !contest.name ||
      Number.isNaN(startsAt.getTime()) ||
      Number.isNaN(endsAt.getTime()) ||
      startsAt >= endsAt
    ) {
      throw new Error(`Invalid contest received: ${contest.externalId || 'unknown'}`);
    }
    await repository.upsertContest(contest);
    seenKeys.push(`${contest.platform}:${contest.externalId}`);
  }
  const removedCandidates = await repository.markMissingFutureContests({ seenKeys, from });
  return { fetched: contests.length, removedCandidates };
}
