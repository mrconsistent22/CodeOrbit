import {
  AdapterError,
  type PlatformAdapter,
  type ProfileSnapshot,
  type SyncCursor,
  type SyncResult,
} from './types.js';

const USER_AGENT = 'CodeOrbitBot/1.0 (+https://github.com/mrconsistent22/CodeOrbit)';
const REQUEST_TIMEOUT_MS = 10_000;

export interface GfgRequest {
  (handle: string): Promise<string>;
}

function numberAfter(html: string, label: string): number | undefined {
  const match = html.match(new RegExp(`${label}[^\\d]{0,100}(\\d[\\d,]*)`, 'i'));
  return match?.[1] ? Number(match[1].replace(/,/g, '')) : undefined;
}

export function parseGfgProfile(html: string, handle: string): ProfileSnapshot {
  if (!html || /user not found|profile not found|404/i.test(html)) {
    throw new AdapterError('NOT_FOUND', `GeeksforGeeks handle not found: ${handle}`);
  }
  const canonicalHandle = html.match(/(?:username|user_name)[^>]*>\s*([^<\s]+)/i)?.[1] ?? handle;
  const totalSolved = numberAfter(html, 'Problems Solved');
  if (totalSolved === undefined) {
    throw new AdapterError(
      'UPSTREAM_CHANGED',
      'GeeksforGeeks profile has no recognizable statistics',
    );
  }
  return { canonicalHandle, totalSolved };
}

export function createGfgAdapter(request?: GfgRequest): PlatformAdapter {
  const fetchProfile: GfgRequest =
    request ??
    (async (handle) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(
          `https://auth.geeksforgeeks.org/user/${encodeURIComponent(handle)}/`,
          {
            headers: { 'user-agent': USER_AGENT },
            signal: controller.signal,
          },
        );
        if (!response.ok)
          throw new AdapterError('NETWORK', `GeeksforGeeks returned HTTP ${response.status}`);
        return response.text();
      } catch (error) {
        if (error instanceof AdapterError) throw error;
        throw new AdapterError('NETWORK', 'GeeksforGeeks profile request failed');
      } finally {
        clearTimeout(timeout);
      }
    });
  return {
    id: 'gfg',
    capabilities: {
      fullSubmissionHistory: false,
      dailyActivityCalendar: false,
      ratingHistory: false,
      problemMetadataLookup: false,
    },
    async validateHandle(handle) {
      const profile = parseGfgProfile(await fetchProfile(handle), handle);
      return { exists: true, canonicalHandle: profile.canonicalHandle };
    },
    async sync(handle, _cursor?: SyncCursor): Promise<SyncResult> {
      return {
        profile: parseGfgProfile(await fetchProfile(handle), handle),
        submissions: [],
        activity: [],
        ratingHistory: [],
      };
    },
  };
}
