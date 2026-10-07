import {
  AdapterError,
  type NormalizedProblemRef,
  type PlatformAdapter,
  type ProfileSnapshot,
  type SyncCursor,
  type SyncResult,
} from './types.js';

const USER_AGENT = 'CodeOrbitBot/1.0 (+https://github.com/mrconsistent22/CodeOrbit)';
const REQUEST_TIMEOUT_MS = 10_000;

export interface CodeChefRequest {
  (handle: string): Promise<string>;
}

function text(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function numberAfter(html: string, label: string): number | undefined {
  const match = html.match(new RegExp(`${label}[^\\d]{0,80}(\\d[\\d,]*)`, 'i'));
  return match?.[1] ? Number(match[1].replace(/,/g, '')) : undefined;
}

export function parseCodeChefProfile(html: string, handle: string): ProfileSnapshot {
  if (!html || /user not found|profile not found|404/i.test(text(html))) {
    throw new AdapterError('NOT_FOUND', `CodeChef handle not found: ${handle}`);
  }
  const canonicalHandle = html.match(/(?:username|user_handle)[^>]*>\s*([^<\s]+)/i)?.[1] ?? handle;
  const totalSolved = numberAfter(html, 'fully solved');
  const rating = numberAfter(html, 'rating');
  if (totalSolved === undefined && rating === undefined) {
    throw new AdapterError('UPSTREAM_CHANGED', 'CodeChef profile has no recognizable statistics');
  }
  return {
    canonicalHandle,
    ...(totalSolved === undefined ? {} : { totalSolved }),
    ...(rating === undefined ? {} : { rating }),
  };
}

export function createCodeChefAdapter(request?: CodeChefRequest): PlatformAdapter {
  const fetchProfile: CodeChefRequest =
    request ??
    (async (handle) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(
          `https://www.codechef.com/users/${encodeURIComponent(handle)}`,
          {
            headers: { 'user-agent': USER_AGENT },
            signal: controller.signal,
          },
        );
        if (!response.ok)
          throw new AdapterError('NETWORK', `CodeChef returned HTTP ${response.status}`);
        return response.text();
      } catch (error) {
        if (error instanceof AdapterError) throw error;
        throw new AdapterError('NETWORK', 'CodeChef profile request failed');
      } finally {
        clearTimeout(timeout);
      }
    });
  return {
    id: 'codechef',
    capabilities: {
      fullSubmissionHistory: false,
      dailyActivityCalendar: false,
      ratingHistory: false,
      problemMetadataLookup: false,
    },
    async validateHandle(handle) {
      const profile = parseCodeChefProfile(await fetchProfile(handle), handle);
      return { exists: true, canonicalHandle: profile.canonicalHandle };
    },
    async sync(handle, _cursor?: SyncCursor): Promise<SyncResult> {
      return {
        profile: parseCodeChefProfile(await fetchProfile(handle), handle),
        submissions: [],
        activity: [],
        ratingHistory: [],
      };
    },
    async lookupProblem(slug): Promise<NormalizedProblemRef> {
      return {
        platform: 'codechef',
        slug: slug.toUpperCase(),
        title: slug.toUpperCase(),
        url: `https://www.codechef.com/problems/${slug.toUpperCase()}`,
      };
    },
  };
}
