import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalizeProblemUrl } from '../src/canonicalize.js';

test('canonicalizes LeetCode variants', () => {
  const urls = [
    'https://leetcode.com/problems/two-sum/',
    'https://leetcode.com/problems/two-sum/description/',
    'https://leetcode.com/problems/two-sum/solutions/?tab=solution',
    'https://www.leetcode.com/problems/two-sum/',
    'https://LEETCODE.COM/problems/two-sum/#examples',
  ];

  for (const url of urls) {
    assert.deepEqual(canonicalizeProblemUrl(url), { platform: 'leetcode', slug: 'two-sum' });
  }
});

test('canonicalizes Codeforces variants', () => {
  const urls = [
    'https://codeforces.com/problemset/problem/1/A',
    'https://codeforces.com/problemset/problem/1/A?locale=en',
    'https://www.codeforces.com/contest/1/problem/A/',
    'https://CODEFORCES.COM/contest/1/problem/A#statement',
    'https://codeforces.com/problemset/problem/4/B/',
  ];

  assert.deepEqual(canonicalizeProblemUrl(urls[0]), { platform: 'codeforces', slug: '1A' });
  assert.deepEqual(canonicalizeProblemUrl(urls[1]), { platform: 'codeforces', slug: '1A' });
  assert.deepEqual(canonicalizeProblemUrl(urls[2]), { platform: 'codeforces', slug: '1A' });
  assert.deepEqual(canonicalizeProblemUrl(urls[3]), { platform: 'codeforces', slug: '1A' });
  assert.deepEqual(canonicalizeProblemUrl(urls[4]), { platform: 'codeforces', slug: '4B' });
});

test('canonicalizes CodeChef variants', () => {
  const urls = [
    'https://www.codechef.com/problems/FLOW001',
    'https://codechef.com/problems/flow001/',
    'https://CODECHEF.COM/problems/TEST?utm_source=sheet',
    'http://www.codechef.com/problems/HS08PAUL#solution',
    'https://codechef.com/problems/START01',
  ];

  for (const url of urls) {
    assert.equal(canonicalizeProblemUrl(url)?.platform, 'codechef');
  }
  assert.equal(canonicalizeProblemUrl(urls[1])?.slug, 'FLOW001');
});

test('canonicalizes GeeksforGeeks variants', () => {
  const urls = [
    'https://www.geeksforgeeks.org/problems/two-sum/1',
    'https://geeksforgeeks.org/problems/two-sum/1/',
    'https://GEEKSFORGEEKS.ORG/problems/two-sum/1?ref=sheet',
    'https://www.geeksforgeeks.org/problems/array-rotation/1',
    'https://geeksforgeeks.org/problems/binary-tree-traversals/1#practice',
  ];

  for (const url of urls) {
    assert.equal(canonicalizeProblemUrl(url)?.platform, 'gfg');
  }
  assert.equal(canonicalizeProblemUrl(urls[0])?.slug, 'two-sum');
});

test('uses a deterministic other-platform slug and rejects invalid URLs', () => {
  assert.deepEqual(
    canonicalizeProblemUrl('https://interviewbit.com/courses/programming/topics/arrays/'),
    {
      platform: 'other',
      slug: 'interviewbit-com-courses-programming-topics-arrays',
    },
  );
  assert.equal(canonicalizeProblemUrl('not a URL'), null);
  assert.equal(canonicalizeProblemUrl('ftp://example.com/problem'), null);
  assert.deepEqual(canonicalizeProblemUrl('https://example.com/'), {
    platform: 'other',
    slug: 'example-com',
  });
});
