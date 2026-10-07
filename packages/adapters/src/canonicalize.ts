import type { PlatformId } from './types.js';

export interface CanonicalProblemRef {
  platform: PlatformId | 'other';
  slug: string;
}

function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function pathSegments(pathname: string): string[] {
  return pathname.split('/').filter(Boolean);
}

function otherSlug(url: URL): string | null {
  const path = pathSegments(url.pathname).join('-');
  const value = slugify(`${url.hostname}-${path}`);
  return value || null;
}

export function canonicalizeProblemUrl(value: string): CanonicalProblemRef | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const segments = pathSegments(url.pathname);

  if (host === 'leetcode.com' && segments[0] === 'problems' && segments[1]) {
    return { platform: 'leetcode', slug: slugify(segments[1]) };
  }

  if (host === 'codeforces.com') {
    if (segments[0] === 'problemset' && segments[1] === 'problem' && segments[2] && segments[3]) {
      return { platform: 'codeforces', slug: `${segments[2]}${segments[3].toUpperCase()}` };
    }
    if (segments[0] === 'contest' && segments[1] && segments[2] === 'problem' && segments[3]) {
      return { platform: 'codeforces', slug: `${segments[1]}${segments[3].toUpperCase()}` };
    }
  }

  if (host === 'codechef.com' && segments[0] === 'problems' && segments[1]) {
    return { platform: 'codechef', slug: segments[1].toUpperCase() };
  }

  if (host === 'geeksforgeeks.org' && segments[0] === 'problems' && segments[1]) {
    return { platform: 'gfg', slug: slugify(segments[1]) };
  }

  const slug = otherSlug(url);
  return slug ? { platform: 'other', slug } : null;
}
