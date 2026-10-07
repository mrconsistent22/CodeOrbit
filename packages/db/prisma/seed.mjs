import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('Missing required environment variable: DATABASE_URL');
}

const adminEmail = process.env.CODEORBIT_ADMIN_EMAIL ?? 'admin@codeorbit.local';
const adminUsername = process.env.CODEORBIT_ADMIN_USERNAME ?? 'admin';
const adminDisplayName = process.env.CODEORBIT_ADMIN_DISPLAY_NAME ?? 'CodeOrbit Admin';
const adminId = process.env.CODEORBIT_ADMIN_ID ?? '00000000-0000-0000-0000-000000000001';

const sqlPath = resolve(dirname(fileURLToPath(import.meta.url)), 'seed.sql');
const result = spawnSync(
  'psql',
  [
    '--set',
    'ON_ERROR_STOP=1',
    '--set',
    `ADMIN_ID=${adminId}`,
    '--set',
    `ADMIN_EMAIL=${adminEmail}`,
    '--set',
    `ADMIN_USERNAME=${adminUsername}`,
    '--set',
    `ADMIN_DISPLAY_NAME=${adminDisplayName}`,
    '--file',
    sqlPath,
    databaseUrl,
  ],
  { stdio: 'inherit', shell: false },
);

if (result.error) {
  if (result.error.code === 'ENOENT') {
    throw new Error('psql is required to seed the database but was not found on PATH.');
  }

  throw result.error;
}

if (result.status !== 0) {
  throw new Error(`Seed script failed with exit code ${result.status}.`);
}
