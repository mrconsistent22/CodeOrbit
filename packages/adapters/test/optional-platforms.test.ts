import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AdapterError,
  createCodeChefAdapter,
  createGfgAdapter,
  parseCodeChefProfile,
  parseGfgProfile,
} from '../src/index.js';

test('parses CodeChef profile fixtures and normalizes the handle', () => {
  const profile = parseCodeChefProfile(
    '<span class="username">chef_user</span><div>Fully Solved 123</div><div>Rating 1789</div>',
    'chef_user',
  );
  assert.deepEqual(profile, { canonicalHandle: 'chef_user', totalSolved: 123, rating: 1789 });
});

test('parses GeeksforGeeks profile fixtures', () => {
  const profile = parseGfgProfile(
    '<span class="username">gfg_user</span><div>Problems Solved 87</div>',
    'gfg_user',
  );
  assert.deepEqual(profile, { canonicalHandle: 'gfg_user', totalSolved: 87 });
});

test('optional adapters validate and sync through injected fixture requests', async () => {
  const codechef = createCodeChefAdapter(
    async () => '<span class="username">chef_user</span> Fully Solved 12 Rating 1400',
  );
  const gfg = createGfgAdapter(
    async () => '<span class="username">gfg_user</span> Problems Solved 8',
  );
  assert.deepEqual(await codechef.validateHandle('chef_user'), {
    exists: true,
    canonicalHandle: 'chef_user',
  });
  assert.equal((await gfg.sync('gfg_user')).profile.totalSolved, 8);
});

test('optional platform parsers fail explicitly when upstream markup changes', () => {
  assert.throws(() => parseCodeChefProfile('<html>profile</html>', 'chef_user'), AdapterError);
  assert.throws(() => parseGfgProfile('<html>profile</html>', 'gfg_user'), AdapterError);
});
