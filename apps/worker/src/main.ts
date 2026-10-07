import { getConfig } from '@codeorbit/config';
import { QUEUE_NAMES } from '@codeorbit/shared';
import { closeQueueRuntime, createQueueRuntime } from './queues.js';

const config = getConfig();
const runtime = createQueueRuntime(config.redisUrl);

for (const worker of runtime.workers.values()) {
  worker.on('failed', (job, error) => {
    console.error(
      JSON.stringify({
        service: 'worker',
        event: 'job_failed',
        queue: worker.name,
        jobId: job?.id,
        error: error.message,
      }),
    );
  });
}

console.log(
  JSON.stringify({
    service: 'worker',
    status: 'ready',
    redisConfigured: Boolean(config.redisUrl),
    queues: Object.values(QUEUE_NAMES),
  }),
);

const shutdown = async (signal: string) => {
  console.log(JSON.stringify({ service: 'worker', status: 'stopping', signal }));
  await closeQueueRuntime(runtime);
  process.exit(0);
};

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
