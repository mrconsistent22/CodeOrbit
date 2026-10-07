import {
  AdapterError,
  type NormalizedProblemRef,
  type PlatformAdapter,
  type ProfileSnapshot,
  type RatingEntry,
  type SyncCursor,
  type SyncResult,
} from './types.js';

const API_URL = 'https://leetcode.com/graphql';
const USER_AGENT = 'CodeOrbitBot/1.0 (+https://github.com/mrconsistent22/CodeOrbit)';
const REQUEST_TIMEOUT_MS = 10_000;

export interface LeetCodeRequest {
  (query: string, variables: Record<string, unknown>): Promise<unknown>;
}

interface LeetCodeProfile {
  username?: string;
  profile?: {
    realName?: string;
    userSlug?: string;
    starRating?: number;
  };
  submitStats?: {
    acSubmissionNum?: Array<{ difficulty?: string; count?: number }>;
  };
  userCalendar?: { submissionCalendar?: string };
  recentAcSubmissionList?: Array<{
    id?: string;
    title?: string;
    titleSlug?: string;
    timestamp?: string;
    lang?: string;
  }>;
  userContestRanking?: { rating?: number; globalRanking?: number };
  userContestRankingHistory?: Array<{
    attended?: boolean;
    rating?: number;
    ranking?: number;
    contest?: { title?: string };
    contestStartTime?: number;
  }>;
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    throw new AdapterError('UPSTREAM_CHANGED', 'LeetCode returned an unexpected response');
  }
  return value as Record<string, unknown>;
}

function profileFromResponse(value: unknown, handle: string): LeetCodeProfile {
  const root = asObject(value);
  const data = asObject(root.data);
  const matchedUser = data.matchedUser;
  if (!matchedUser) throw new AdapterError('NOT_FOUND', `LeetCode handle not found: ${handle}`);
  const profile = asObject(matchedUser) as LeetCodeProfile;
  if (!profile.submitStats?.acSubmissionNum) {
    throw new AdapterError('UPSTREAM_CHANGED', 'LeetCode profile is missing submission statistics');
  }
  return profile;
}

function countFor(profile: LeetCodeProfile, difficulty: string): number | undefined {
  const entry = profile.submitStats?.acSubmissionNum?.find(
    (item) => item.difficulty?.toLowerCase() === difficulty.toLowerCase(),
  );
  return entry?.count;
}

function parseCalendar(calendar: string | undefined): SyncResult['activity'] {
  if (!calendar) return [];
  let values: Record<string, unknown>;
  try {
    values = JSON.parse(calendar) as Record<string, unknown>;
  } catch {
    throw new AdapterError('UPSTREAM_CHANGED', 'LeetCode activity calendar is invalid');
  }
  return Object.entries(values)
    .map(([timestamp, value]) => {
      const seconds = Number(timestamp);
      const submissions = Number(value);
      if (!Number.isFinite(seconds) || !Number.isFinite(submissions)) {
        throw new AdapterError(
          'UPSTREAM_CHANGED',
          'LeetCode activity calendar contains invalid data',
        );
      }
      return {
        day: new Date(seconds * 1_000).toISOString().slice(0, 10),
        submissions,
        accepted: 0,
      };
    })
    .sort((a, b) => a.day.localeCompare(b.day));
}

function problemRef(slug: string, title: string): NormalizedProblemRef {
  return {
    platform: 'leetcode',
    slug,
    title,
    url: `https://leetcode.com/problems/${slug}/`,
  };
}

export function parseLeetCodeProfile(value: unknown, handle: string): ProfileSnapshot {
  const profile = profileFromResponse(value, handle);
  const canonicalHandle = profile.username ?? profile.profile?.userSlug;
  if (!canonicalHandle)
    throw new AdapterError('UPSTREAM_CHANGED', 'LeetCode profile has no username');
  const totalSolved = countFor(profile, 'all');
  const easySolved = countFor(profile, 'easy');
  const mediumSolved = countFor(profile, 'medium');
  const hardSolved = countFor(profile, 'hard');
  return {
    canonicalHandle,
    ...(totalSolved === undefined ? {} : { totalSolved }),
    ...(easySolved === undefined ? {} : { easySolved }),
    ...(mediumSolved === undefined ? {} : { mediumSolved }),
    ...(hardSolved === undefined ? {} : { hardSolved }),
    ...(profile.userContestRanking?.rating === undefined
      ? {}
      : { rating: profile.userContestRanking.rating }),
    ...(profile.userContestRanking?.globalRanking === undefined
      ? {}
      : { globalRank: profile.userContestRanking.globalRanking }),
    ...(profile.profile?.starRating === undefined
      ? {}
      : { extra: { starRating: profile.profile.starRating } }),
  };
}

export function parseLeetCodeSubmissions(
  value: unknown,
  cursor?: SyncCursor,
): Pick<SyncResult, 'submissions' | 'activity'> & { nextCursor?: SyncCursor } {
  const profile = profileFromResponse(value, 'unknown');
  const lastTimestamp =
    typeof cursor?.lastSubmissionTime === 'number' ? cursor.lastSubmissionTime : 0;
  const submissions = (profile.recentAcSubmissionList ?? [])
    .filter((entry) => entry.id && entry.title && entry.titleSlug && entry.timestamp)
    .filter((entry) => Number(entry.timestamp) > lastTimestamp)
    .map((entry) => ({
      externalId: String(entry.id),
      problem: problemRef(String(entry.titleSlug), String(entry.title)),
      verdict: 'accepted' as const,
      ...(entry.lang ? { language: entry.lang } : {}),
      submittedAt: new Date(Number(entry.timestamp) * 1_000).toISOString(),
    }));
  return {
    submissions,
    activity: parseCalendar(profile.userCalendar?.submissionCalendar),
    ...(submissions[0]?.submittedAt
      ? {
          nextCursor: {
            lastSubmissionTime: Math.floor(Date.parse(submissions[0].submittedAt) / 1_000),
          },
        }
      : {}),
  };
}

export function parseLeetCodeRatings(value: unknown): RatingEntry[] {
  const profile = profileFromResponse(value, 'unknown');
  return (profile.userContestRankingHistory ?? [])
    .filter((entry) => entry.attended && entry.rating !== undefined && entry.contest?.title)
    .map((entry, index) => ({
      contestId: `${entry.contest?.title}-${index}`,
      contestName: entry.contest?.title ?? 'LeetCode contest',
      ratedAt: new Date((entry.contestStartTime ?? 0) * 1_000).toISOString(),
      newRating: entry.rating ?? 0,
      ...(entry.ranking === undefined ? {} : { rank: entry.ranking }),
    }));
}

export function parseLeetCodeProblem(value: unknown, slug: string): NormalizedProblemRef | null {
  const root = asObject(value);
  const data = asObject(root.data);
  const question = data.question;
  if (!question) return null;
  const item = asObject(question);
  const title = item.title;
  if (typeof title !== 'string')
    throw new AdapterError('UPSTREAM_CHANGED', 'LeetCode problem has no title');
  const difficulty = item.difficulty;
  return {
    ...problemRef(slug, title),
    ...(difficulty === 'Easy' || difficulty === 'Medium' || difficulty === 'Hard'
      ? { difficulty: difficulty.toLowerCase() as 'easy' | 'medium' | 'hard' }
      : {}),
    ...(Array.isArray(item.topicTags)
      ? {
          tags: item.topicTags.flatMap((tag) => {
            if (!tag || typeof tag !== 'object' || !('name' in tag) || typeof tag.name !== 'string')
              return [];
            return [tag.name];
          }),
        }
      : {}),
  };
}

const PROFILE_QUERY = `query($username:String!) {
  matchedUser(username:$username) {
    username profile { userSlug starRating }
    submitStats { acSubmissionNum { difficulty count } }
    userCalendar { submissionCalendar }
    recentAcSubmissionList { id title titleSlug timestamp lang }
    userContestRanking { rating globalRanking }
    userContestRankingHistory { attended rating ranking contest { title } contestStartTime }
  }
}`;

function mapRequestError(error: unknown): AdapterError {
  if (error instanceof AdapterError) return error;
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new AdapterError('NETWORK', 'LeetCode request timed out');
  }
  return new AdapterError(
    'NETWORK',
    error instanceof Error ? error.message : 'LeetCode request failed',
  );
}

export function createLeetCodeAdapter(
  request: LeetCodeRequest = createLeetCodeRequest(),
): PlatformAdapter {
  return {
    id: 'leetcode',
    capabilities: {
      fullSubmissionHistory: false,
      dailyActivityCalendar: true,
      ratingHistory: true,
      problemMetadataLookup: true,
    },
    async validateHandle(handle) {
      const canonicalHandle = handle.trim();
      if (!canonicalHandle) return { exists: false, canonicalHandle };
      try {
        const profile = profileFromResponse(
          await request(PROFILE_QUERY, { username: canonicalHandle }),
          canonicalHandle,
        );
        return {
          exists: true,
          canonicalHandle: profile.username ?? profile.profile?.userSlug ?? canonicalHandle,
        };
      } catch (error) {
        if (error instanceof AdapterError && error.code === 'NOT_FOUND') {
          return { exists: false, canonicalHandle };
        }
        throw mapRequestError(error);
      }
    },
    async sync(handle, cursor) {
      try {
        const response = await request(PROFILE_QUERY, { username: handle });
        const profile = parseLeetCodeProfile(response, handle);
        const parsed = parseLeetCodeSubmissions(response, cursor);
        return {
          profile,
          submissions: parsed.submissions,
          activity: parsed.activity,
          ratingHistory: parseLeetCodeRatings(response),
          ...(parsed.nextCursor ? { nextCursor: parsed.nextCursor } : {}),
        };
      } catch (error) {
        throw mapRequestError(error);
      }
    },
    async lookupProblem(slug) {
      try {
        const response = await request(
          `query($titleSlug:String!) { question(titleSlug:$titleSlug) { title difficulty topicTags { name } } }`,
          { titleSlug: slug },
        );
        return parseLeetCodeProblem(response, slug);
      } catch (error) {
        throw mapRequestError(error);
      }
    },
  };
}

function createLeetCodeRequest(): LeetCodeRequest {
  return async (query, variables) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'user-agent': USER_AGENT,
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });
      if (response.status === 429)
        throw new AdapterError('RATE_LIMITED', 'LeetCode rate limit exceeded', 60_000);
      if (!response.ok)
        throw new AdapterError('NETWORK', `LeetCode returned HTTP ${response.status}`);
      return response.json();
    } finally {
      clearTimeout(timeout);
    }
  };
}
