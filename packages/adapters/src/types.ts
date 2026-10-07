export type PlatformId = 'leetcode' | 'codeforces' | 'codechef' | 'gfg';

export type AdapterErrorCode =
  'NOT_FOUND' | 'PRIVATE_PROFILE' | 'RATE_LIMITED' | 'UPSTREAM_CHANGED' | 'NETWORK' | 'DISABLED';

export class AdapterError extends Error {
  constructor(
    public readonly code: AdapterErrorCode,
    message: string,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'AdapterError';
  }
}

export interface NormalizedProblemRef {
  platform: PlatformId | 'other';
  slug: string;
  title: string;
  url: string;
  difficulty?: 'easy' | 'medium' | 'hard' | 'unrated';
  rating?: number;
  tags?: string[];
}

export interface NormalizedSubmission {
  externalId: string;
  problem: NormalizedProblemRef;
  verdict: 'accepted' | 'wrong_answer' | 'time_limit' | 'runtime_error' | 'other';
  language?: string;
  submittedAt: string;
}

export interface DailyActivity {
  day: string;
  submissions: number;
  accepted: number;
}

export interface RatingEntry {
  contestId: string;
  contestName: string;
  ratedAt: string;
  oldRating?: number;
  newRating: number;
  rank?: number;
}

export interface ProfileSnapshot {
  canonicalHandle: string;
  totalSolved?: number;
  easySolved?: number;
  mediumSolved?: number;
  hardSolved?: number;
  rating?: number;
  maxRating?: number;
  rankLabel?: string;
  globalRank?: number;
  extra?: Record<string, unknown>;
}

export interface SyncCursor {
  [key: string]: unknown;
}

export interface SyncResult {
  profile: ProfileSnapshot;
  submissions: NormalizedSubmission[];
  activity: DailyActivity[];
  ratingHistory: RatingEntry[];
  nextCursor?: SyncCursor;
}

export interface AdapterCapabilities {
  fullSubmissionHistory: boolean;
  dailyActivityCalendar: boolean;
  ratingHistory: boolean;
  problemMetadataLookup: boolean;
}

export interface PlatformAdapter {
  readonly id: PlatformId;
  readonly capabilities: AdapterCapabilities;
  validateHandle(handle: string): Promise<{ exists: boolean; canonicalHandle: string }>;
  sync(handle: string, cursor?: SyncCursor): Promise<SyncResult>;
  lookupProblem?(slug: string): Promise<NormalizedProblemRef | null>;
  verifyOwnership?(handle: string, token: string): Promise<boolean>;
}
