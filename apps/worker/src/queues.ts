import { Queue, Worker, type Job, type Processor } from 'bullmq';
import { QUEUE_NAMES, type QueueName } from '@codeorbit/shared';

export interface QueueConfig {
  name: QueueName;
  limiter: {
    max: number;
    duration: number;
  };
}

export const QUEUE_CONFIGS: readonly QueueConfig[] = [
  { name: QUEUE_NAMES.syncCodeforces, limiter: { max: 1, duration: 1_000 } },
  { name: QUEUE_NAMES.syncLeetcode, limiter: { max: 1, duration: 1_000 } },
  { name: QUEUE_NAMES.syncCodechef, limiter: { max: 1, duration: 1_000 } },
  { name: QUEUE_NAMES.syncGfg, limiter: { max: 1, duration: 1_000 } },
  { name: QUEUE_NAMES.contests, limiter: { max: 1, duration: 1_000 } },
  { name: QUEUE_NAMES.reminders, limiter: { max: 10, duration: 1_000 } },
];

export interface QueueRuntime {
  queues: Map<QueueName, Queue>;
  workers: Map<QueueName, Worker>;
}

export function createQueueRuntime(
  redisUrl: string,
  processor: Processor = dummyProcessor,
): QueueRuntime {
  const connection = { url: redisUrl };
  const queues = new Map<QueueName, Queue>();
  const workers = new Map<QueueName, Worker>();

  for (const config of QUEUE_CONFIGS) {
    queues.set(
      config.name,
      new Queue(config.name, {
        connection,
        defaultJobOptions: { removeOnComplete: 100, removeOnFail: 100 },
      }),
    );
    workers.set(
      config.name,
      new Worker(config.name, processor, {
        connection,
        limiter: config.limiter,
      }),
    );
  }

  return { queues, workers };
}

export async function dummyProcessor(job: Job): Promise<{ processed: true; jobId: string }> {
  return { processed: true, jobId: job.id ?? job.name };
}

export async function closeQueueRuntime(runtime: QueueRuntime): Promise<void> {
  await Promise.all(
    [...runtime.workers.values(), ...runtime.queues.values()].map((resource) => resource.close()),
  );
}
