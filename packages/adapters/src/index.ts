export * from './canonicalize.js';
export * from './codeforces.js';
export * from './codechef.js';
export * from './gfg.js';
export * from './leetcode.js';
export * from './types.js';

import { createCodeChefAdapter } from './codechef.js';
import { createGfgAdapter } from './gfg.js';
import type { PlatformAdapter } from './types.js';

export function createOptionalAdapters(flags: {
  enableCodeChefAdapter: boolean;
  enableGfgAdapter: boolean;
}): Map<PlatformAdapter['id'], PlatformAdapter> {
  const adapters = new Map<PlatformAdapter['id'], PlatformAdapter>();
  if (flags.enableCodeChefAdapter) adapters.set('codechef', createCodeChefAdapter());
  if (flags.enableGfgAdapter) adapters.set('gfg', createGfgAdapter());
  return adapters;
}
