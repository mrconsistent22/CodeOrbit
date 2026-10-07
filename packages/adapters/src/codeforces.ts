import {
  AdapterError,
  type NormalizedProblemRef,
  type PlatformAdapter,
  type ProfileSnapshot,
  type RatingEntry,
  type SyncCursor,
  type SyncResult,
} from './types.js';

const API_BASE_URL = 'https://codeforces.com/api';
const USER_AGENT = 'CodeOrbitBot/1.0 (+https://github.com/mrconsistent22/CodeOrbit)';
const REQUEST_TIMEOUT_MS = 10_000;

interface CodeforcesResponse<T> {
  status: 'OK' | 'FAILED';
  result?: T;
  comment?: string;
}

interface CodeforcesUser {
  handle: string;
  rating?: number;
  maxRating?: number;
  rank?: string;
  maxRank?: string;
  contribution?: number;
}

interface CodeforcesSubmission {
  id: number;
  creationTimeSeconds: number;
  problem: {
    contestId?: number;
    index?: string;
    name: string;
    rating?: number;
    tags?: string[];
  };
  programmingLanguage?: string;
  verdict?: string;
}

interface CodeforcesRatingChange {
  contestId: number;
  contestName: string;
  ratingUpdateTimeSeconds: number;
  oldRating: number;
  newRating: number;
  rank: number;
}

export interface CodeforcesRequest {
  <T>(method: string, params: Record<string, string | number | undefined>): Promise<T>;
}

function asResponse<T>(value: unknown): CodeforcesResponse<T> {
  if (!value || typeof value !== 'object' || !('status' in value)) {
    throw new AdapterError('UPSTREAM_CHANGED', 'Codeforces returned an unexpected response');
  }
  return value as CodeforcesResponse<T>;
}

function isAccepted(verdict: string | undefined): boolean {
  return verdict === 'OK';
}

function normalizeVerdict(
  verdict: string | undefined,
): 'accepted' | 'wrong_answer' | 'time_limit' | 'runtime_error' | 'other' {
  switch (verdict) {
    case 'OK':
      return 'accepted';
    case 'WRONG_ANSWER':
      return 'wrong_answer';
    case 'TIME_LIMIT_EXCEEDED':
      return 'time_limit';
    case 'RUNTIME_ERROR':
      return 'runtime_error';
    default:
      return 'other';
  }
}

function problemRef(submission: CodeforcesSubmission): NormalizedProblemRef {
  const contestId = submission.problem.contestId;
  const index = submission.problem.index;
  if (!contestId || !index) {
    throw new AdapterError('UPSTREAM_CHANGED', 'Codeforces submission is missing problem identity');
  }

  return {
    platform: 'codeforces',
    slug: `${contestId}${index.toUpperCase()}`,
    title: submission.problem.name,
    url: `https://codeforces.com/contest/${contestId}/problem/${index}`,
    difficulty: 'unrated',
    ...(submission.problem.rating === undefined ? {} : { rating: submission.problem.rating }),
    ...(submission.problem.tags === undefined ? {} : { tags: submission.problem.tags }),
  };
}

function dayFromUnixSeconds(seconds: number): string {
  return new Date(seconds * 1_000).toISOString().slice(0, 10);
}

function parseCursor(cursor: SyncCursor | undefined): {
  lastSubmissionId?: number;
  lastSubmissionTime?: number;
} {
  const lastSubmissionId = cursor?.lastSubmissionId;
  const lastSubmissionTime = cursor?.lastSubmissionTime;
  return {
    ...(typeof lastSubmissionId === 'number' ? { lastSubmissionId } : {}),
    ...(typeof lastSubmissionTime === 'number' ? { lastSubmissionTime } : {}),
  };
}

function responseError(response: CodeforcesResponse<unknown>, handle: string): never {
  const comment = response.comment ?? 'Codeforces request failed';
  if (/not found|handle/i.test(comment))
    throw new AdapterError('NOT_FOUND', `Codeforces handle not found: ${handle}`);
  throw new AdapterError('UPSTREAM_CHANGED', comment);
}

export function parseCodeforcesUser(response: unknown, handle: string): CodeforcesUser {
  const parsed = asResponse<CodeforcesUser[]>(response);
  if (parsed.status !== 'OK' || !parsed.result?.[0]) responseError(parsed, handle);
  return parsed.result[0];
}

export function parseCodeforcesRatings(response: unknown): RatingEntry[] {
  const parsed = asResponse<CodeforcesRatingChange[]>(response);
  if (parsed.status !== 'OK' || !parsed.result) responseError(parsed, 'unknown');

  return parsed.result.map((entry) => ({
    contestId: String(entry.contestId),
    contestName: entry.contestName,
    ratedAt: new Date(entry.ratingUpdateTimeSeconds * 1_000).toISOString(),
    oldRating: entry.oldRating,
    newRating: entry.newRating,
    rank: entry.rank,
  }));
}

export function parseCodeforcesSubmissions(
  response: unknown,
  cursor?: SyncCursor,
): {
  submissions: SyncResult['submissions'];
  activity: SyncResult['activity'];
  nextCursor?: SyncCursor;
} {
  const parsed = asResponse<CodeforcesSubmission[]>(response);
  if (parsed.status !== 'OK' || !parsed.result) responseError(parsed, 'unknown');
  const previous = parseCursor(cursor);
  const submissions = parsed.result
    .filter((submission) => {
      if (previous.lastSubmissionId !== undefined) return submission.id > previous.lastSubmissionId;
      if (previous.lastSubmissionTime !== undefined)
        return submission.creationTimeSeconds > previous.lastSubmissionTime;
      return true;
    })
    .map((submission) => ({
      externalId: String(submission.id),
      problem: problemRef(submission),
      verdict: normalizeVerdict(submission.verdict),
      ...(submission.programmingLanguage ? { language: submission.programmingLanguage } : {}),
      submittedAt: new Date(submission.creationTimeSeconds * 1_000).toISOString(),
    }));

  const activity = new Map<string, { submissions: number; accepted: number }>();
  for (const submission of submissions) {
    const day = submission.submittedAt.slice(0, 10);
    const current = activity.get(day) ?? { submissions: 0, accepted: 0 };
    current.submissions += 1;
    if (submission.verdict === 'accepted') current.accepted += 1;
    activity.set(day, current);
  }

  const newest = parsed.result[0];
  return {
    submissions,
    activity: [...activity.entries()].map(([day, counts]) => ({ day, ...counts })),
    ...(newest
      ? {
          nextCursor: {
            lastSubmissionId: newest.id,
            lastSubmissionTime: newest.creationTimeSeconds,
          },
        }
      : {}),
  };
}

export function createCodeforcesAdapter(
  request: CodeforcesRequest = createCodeforcesRequest(),
): PlatformAdapter {
  return {
    id: 'codeforces',
    capabilities: {
      fullSubmissionHistory: true,
      dailyActivityCalendar: false,
      ratingHistory: true,
      problemMetadataLookup: false,
    },
    async validateHandle(handle) {
      const canonicalHandle = handle.trim();
      if (!canonicalHandle) return { exists: false, canonicalHandle };
      try {
        const response = await request<CodeforcesResponse<CodeforcesUser[]>>('user.info', {
          handles: canonicalHandle,
        });
        const user = parseCodeforcesUser(response, canonicalHandle);
        return { exists: true, canonicalHandle: user.handle };
      } catch (error) {
        if (error instanceof AdapterError) {
          if (error.code === 'NOT_FOUND') return { exists: false, canonicalHandle };
          throw error;
        }
        throw mapRequestError(error);
      }
    },
    async sync(handle, cursor) {
      try {
        const [userResponse, ratingResponse, statusResponse] = await Promise.all([
          request<CodeforcesResponse<CodeforcesUser[]>>('user.info', { handles: handle }),
          request<CodeforcesResponse<CodeforcesRatingChange[]>>('user.rating', { handle }),
          request<CodeforcesResponse<CodeforcesSubmission[]>>('user.status', {
            handle,
            from: 1,
            count: 1000,
          }),
        ]);
        const user = parseCodeforcesUser(userResponse, handle);
        const parsedSubmissions = parseCodeforcesSubmissions(statusResponse, cursor);
        const profile: ProfileSnapshot = {
          canonicalHandle: user.handle,
          ...(user.rating === undefined ? {} : { rating: user.rating }),
          ...(user.maxRating === undefined ? {} : { maxRating: user.maxRating }),
          ...(user.rank ? { rankLabel: user.rank } : {}),
          extra: { contribution: user.contribution ?? 0, maxRank: user.maxRank ?? null },
        };
        return {
          profile,
          submissions: parsedSubmissions.submissions,
          activity: parsedSubmissions.activity,
          ratingHistory: parseCodeforcesRatings(ratingResponse),
          ...(parsedSubmissions.nextCursor ? { nextCursor: parsedSubmissions.nextCursor } : {}),
        };
      } catch (error) {
        if (error instanceof AdapterError) throw error;
        throw mapRequestError(error);
      }
    },
  };
}

function mapRequestError(error: unknown): AdapterError {
  if (error instanceof AdapterError) return error;
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new AdapterError('NETWORK', 'Codeforces request timed out');
  }
  return new AdapterError(
    'NETWORK',
    error instanceof Error ? error.message : 'Codeforces request failed',
  );
}

function createCodeforcesRequest(): CodeforcesRequest {
  return async <T>(
    method: string,
    params: Record<string, string | number | undefined>,
  ) => {
    const url = new URL(`${API_BASE_URL}/${method}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
        signal: controller.signal,
      });
      if (response.status === 429) {
        throw new AdapterError('RATE_LIMITED', 'Codeforces rate limit exceeded', 60_000);
      }
      if (!response.ok)
        throw new AdapterError('NETWORK', `Codeforces returned HTTP ${response.status}`);
      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  };
}
