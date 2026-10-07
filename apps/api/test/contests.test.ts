import test from 'node:test';
import assert from 'node:assert/strict';
import { contestsToIcs, normalizeContestWindow, type Contest } from '../src/contests.js';

const contest: Contest = {
  id: 'contest-1',
  platform: 'codeforces',
  externalId: 'round-1',
  name: 'Round 1; Finals',
  url: 'https://codeforces.com/contests/1',
  startsAt: '2026-10-10T10:00:00.000Z',
  endsAt: '2026-10-10T12:00:00.000Z',
  source: 'codeforces',
};

test('normalizes the default contest window and rejects windows over 45 days', () => {
  const range = normalizeContestWindow(null, null, new Date('2026-10-07T00:00:00.000Z'));
  assert.deepEqual(range, {
    from: '2026-10-07T00:00:00.000Z',
    to: '2026-11-21T00:00:00.000Z',
  });
  assert.throws(() => normalizeContestWindow('2026-01-01T00:00:00Z', '2026-02-16T00:00:00Z'));
});

test('exports escaped contest data as RFC 5545 calendar text', () => {
  const ics = contestsToIcs([contest], new Date('2026-10-07T00:00:00.000Z'));
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /SUMMARY:Round 1\\; Finals/);
  assert.match(ics, /DTSTART:20261010T100000Z/);
  assert.match(ics, /END:VCALENDAR/);
  assert.equal(ics.endsWith('\r\n'), true);
});
