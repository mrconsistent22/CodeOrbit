const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const migrationPath = join(root, 'prisma', 'migrations', '20261007152600_init', 'migration.sql');
const seedSqlPath = join(root, 'prisma', 'seed.sql');
const seedScriptPath = join(root, 'prisma', 'seed.mjs');

test('migration contains the core foundation tables', () => {
  const migration = readFileSync(migrationPath, 'utf8');

  assert.match(migration, /CREATE TABLE "users"/);
  assert.match(migration, /CREATE TABLE "platform_accounts"/);
  assert.match(migration, /CREATE TYPE "UserRole"/);
  assert.match(migration, /CREATE TYPE "PlatformId"/);
  assert.match(migration, /CREATE TYPE "SyncStatus"/);
  assert.match(migration, /CREATE TABLE "problems"/);
  assert.match(migration, /CREATE TABLE "sync_jobs"/);
  assert.match(migration, /CREATE TABLE "contests"/);
  assert.match(migration, /CREATE TABLE "contest_reminders"/);
  assert.match(migration, /submissions_user_id_submitted_at_idx/);
  assert.match(migration, /activity_daily_pkey/);
  assert.match(migration, /solved_problems_pkey/);
});

test('seed assets are aligned', () => {
  const seedSql = readFileSync(seedSqlPath, 'utf8');
  const seedScript = readFileSync(seedScriptPath, 'utf8');

  assert.match(seedSql, /INSERT INTO "users"/);
  assert.match(seedScript, /psql/);
  assert.match(seedScript, /DATABASE_URL/);
});
