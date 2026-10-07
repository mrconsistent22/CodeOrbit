# Architecture decisions

## 2026-09-29 — P0 foundation

- Keep the current static prototype available at the repository root while the product moves toward the PRD monorepo layout.
- Use TypeScript strict mode across new packages.
- Keep API, worker, database, and shared contracts separate so later platform adapters and AI features cannot leak infrastructure concerns into the UI.
- Use environment validation at process startup; missing required production configuration must fail explicitly.
- Docker Compose is the supported local dependency setup for PostgreSQL and Redis. Docker is not available in the current development environment, so service startup is documented but not run here.

## 2026-10-07 — Worker queue isolation

- Use one BullMQ queue and worker lane per platform, plus separate contests and reminders queues.
- Dashboard performance is protected by migration-level indexes on user submission
  timelines and primary keys for per-user activity/solved-problem lookups. The
  happy-path API test uses injected repositories; live Postgres benchmarking is
  deferred until the Prisma repository is wired.
- Configure rate limits per lane rather than using one global limiter, so an upstream platform failure or throttle does not block unrelated work.
- Keep the worker processor injectable so queue behavior can be tested without requiring Redis in unit tests.

## 2026-10-07 — Upstream integration spikes

- **Codeforces: go.** Live probes of `user.info`, `user.status`, and `contest.list` returned
  `status: OK`; compact response fixtures are stored under
  `packages/adapters/codeforces/__fixtures__/`.
- **LeetCode: go with caution.** The public GraphQL `matchedUser` query returned profile and
  accepted-submission totals for `tourist`. The endpoint is unofficial and the first probe
  exposed schema drift (`userRating` is not a current field), so the adapter must remain
  fixture-backed and treat schema changes as an explicit upstream error.
- **CodeChef: defer.** A public profile page returned HTTP 200 for `aashish`, but the parser
  spike is still required before enabling the adapter. Keep it behind a feature flag.
- **GFG: defer.** A public profile page returned HTTP 200, but no stable structured API was
  verified. Keep it behind a feature flag pending a parser spike.
- **clist.by: blocked pending credentials.** The unauthenticated contests endpoint returned
  HTTP 401. Do not add a client until an API key is configured and a fixture is captured.
- MVP go/no-go: proceed with Codeforces, LeetCode, and Codeforces contest ingestion; defer
  CodeChef, GFG, and clist.by until their individual spikes pass.

## 2026-10-07 - LeetCode adapter

- Use the public GraphQL endpoint through an injectable request boundary.
- Treat aggregate solved counts, the submission calendar, recent accepted submissions,
  and contest history as separate normalized surfaces.
- LeetCode's public recent accepted list is incremental only; it does not replace a
  complete solved-problem history. Malformed GraphQL data is surfaced as
  `UPSTREAM_CHANGED` so the adapter can be disabled without corrupting sync state.

## Sync-account persistence boundary

The `sync-account` worker job depends on an injected repository transaction and cache
invalidation boundary. This keeps adapter results and persistence behavior independently
testable while Prisma client generation and production repository wiring are completed.
Adapter failures are mapped to account-facing status messages; persistence failures are
reported separately and are not retried as upstream network failures.
