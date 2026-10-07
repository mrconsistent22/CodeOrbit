-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('user', 'admin');

-- CreateEnum
CREATE TYPE "PlatformId" AS ENUM ('leetcode', 'codeforces', 'codechef', 'gfg', 'other');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('pending', 'syncing', 'ok', 'failed');
CREATE TYPE "Difficulty" AS ENUM ('easy', 'medium', 'hard', 'unrated');
CREATE TYPE "Verdict" AS ENUM ('accepted', 'wrong_answer', 'time_limit', 'runtime_error', 'other');
CREATE TYPE "SolveSource" AS ENUM ('sync', 'manual', 'extension');
CREATE TYPE "SyncTrigger" AS ENUM ('link', 'manual', 'scheduled');
CREATE TYPE "ContestSource" AS ENUM ('clist', 'codeforces');

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "bio" TEXT,
    "college" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "role" "UserRole" NOT NULL DEFAULT 'user',
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_active_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "onboarding_completed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "platform" "PlatformId" NOT NULL,
    "handle" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "status" "SyncStatus" NOT NULL DEFAULT 'pending',
    "last_synced_at" TIMESTAMP(3),
    "last_error" TEXT,
    "sync_cursor" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "platform_accounts_user_id_platform_key" ON "platform_accounts"("user_id", "platform");

-- CreateIndex
CREATE INDEX "platform_accounts_platform_handle_idx" ON "platform_accounts"("platform", "handle");

-- AddForeignKey
ALTER TABLE "platform_accounts"
ADD CONSTRAINT "platform_accounts_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "problems" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "platform" "PlatformId" NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "difficulty" "Difficulty" NOT NULL DEFAULT 'unrated',
    "rating" INTEGER,
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "problems_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "problems_platform_slug_key" ON "problems"("platform", "slug");
CREATE INDEX "problems_tags_idx" ON "problems" USING GIN ("tags");

CREATE TABLE "submissions" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "problem_id" UUID NOT NULL,
    "external_submission_id" TEXT NOT NULL,
    "verdict" "Verdict" NOT NULL,
    "language" TEXT,
    "submitted_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "submissions_account_id_external_submission_id_key"
  ON "submissions"("account_id", "external_submission_id");
CREATE INDEX "submissions_user_id_submitted_at_idx" ON "submissions"("user_id", "submitted_at" DESC);

CREATE TABLE "activity_daily" (
    "account_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "submissions" INTEGER NOT NULL DEFAULT 0,
    "accepted" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "activity_daily_pkey" PRIMARY KEY ("account_id", "day")
);

CREATE TABLE "solved_problems" (
    "user_id" UUID NOT NULL,
    "problem_id" UUID NOT NULL,
    "first_solved_at" TIMESTAMP(3),
    "source" "SolveSource" NOT NULL DEFAULT 'sync',
    "account_id" UUID,
    CONSTRAINT "solved_problems_pkey" PRIMARY KEY ("user_id", "problem_id")
);

CREATE TABLE "platform_stats" (
    "account_id" UUID NOT NULL,
    "total_solved" INTEGER,
    "easy_solved" INTEGER,
    "medium_solved" INTEGER,
    "hard_solved" INTEGER,
    "rating" INTEGER,
    "max_rating" INTEGER,
    "rank_label" TEXT,
    "global_rank" INTEGER,
    "extra" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "platform_stats_pkey" PRIMARY KEY ("account_id")
);

CREATE TABLE "rating_history" (
    "id" BIGSERIAL NOT NULL,
    "account_id" UUID NOT NULL,
    "contest_id" TEXT NOT NULL,
    "contest_name" TEXT NOT NULL,
    "rated_at" TIMESTAMP(3) NOT NULL,
    "old_rating" INTEGER,
    "new_rating" INTEGER NOT NULL,
    "rank" INTEGER,
    CONSTRAINT "rating_history_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "rating_history_account_id_contest_id_key"
  ON "rating_history"("account_id", "contest_id");

CREATE TABLE "sync_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "account_id" UUID NOT NULL,
    "trigger" "SyncTrigger" NOT NULL,
    "status" "SyncStatus" NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "items_fetched" INTEGER DEFAULT 0,
    "error_code" TEXT,
    "error_detail" TEXT,
    CONSTRAINT "sync_jobs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "sync_jobs_started_at_idx" ON "sync_jobs"("started_at" DESC);

ALTER TABLE "submissions" ADD CONSTRAINT "submissions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "platform_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_problem_id_fkey"
  FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON UPDATE CASCADE;
ALTER TABLE "activity_daily" ADD CONSTRAINT "activity_daily_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "platform_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "solved_problems" ADD CONSTRAINT "solved_problems_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "solved_problems" ADD CONSTRAINT "solved_problems_problem_id_fkey"
  FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON UPDATE CASCADE;
ALTER TABLE "solved_problems" ADD CONSTRAINT "solved_problems_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "platform_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "platform_stats" ADD CONSTRAINT "platform_stats_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "platform_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rating_history" ADD CONSTRAINT "rating_history_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "platform_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "platform_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "contests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "platform" "PlatformId" NOT NULL,
    "external_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "source" "ContestSource" NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "contest_reminders" (
    "user_id" UUID NOT NULL,
    "contest_id" UUID NOT NULL,
    "offset_minutes" INTEGER NOT NULL,
    "sent_at" TIMESTAMPTZ,
    CONSTRAINT "contest_reminders_pkey" PRIMARY KEY ("user_id", "contest_id", "offset_minutes"),
    CONSTRAINT "contest_reminders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
    CONSTRAINT "contest_reminders_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "contests"("id") ON DELETE CASCADE
);

CREATE INDEX "contest_reminders_sent_at_offset_minutes_idx" ON "contest_reminders"("sent_at", "offset_minutes");
CREATE UNIQUE INDEX "contests_platform_external_id_key" ON "contests"("platform", "external_id");
CREATE INDEX "contests_starts_at_idx" ON "contests"("starts_at");
