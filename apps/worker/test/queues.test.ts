import test from 'node:test';
import assert from 'node:assert/strict';
import { dummyProcessor, QUEUE_CONFIGS } from '../src/queues.js';
import { QUEUE_NAMES } from '@codeorbit/shared';

test('configures every foundation queue with a limiter', () => {
  assert.deepEqual(
    QUEUE_CONFIGS.map((config) => config.name),
    Object.values(QUEUE_NAMES),
  );

  for (const config of QUEUE_CONFIGS) {
    assert.ok(config.limiter.max > 0);
    assert.ok(config.limiter.duration > 0);
  }
});

test('dummy processor returns a processed result', async () => {
  const result = await dummyProcessor({
    id: 'dummy-1',
    name: 'dummy',
  } as never);

  assert.deepEqual(result, { processed: true, jobId: 'dummy-1' });
});
