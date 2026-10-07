# CodeOrbit

CodeOrbit is a unified coding-progress and interview-preparation platform.

## P0 foundation

The repository is organized as a pnpm workspace:

- `apps/web` — existing browser prototype; the Next.js migration will happen after the foundation.
- `apps/api` — REST API foundation and health endpoint.
- `apps/worker` — background-job entry point and queue contracts.
- `packages/shared` — shared enums and validation contracts.
- `packages/db` — Prisma schema and database client boundary.
- `packages/config` — environment validation.
- `data/sheets` — curated sheet data.
- `docs` — architecture decisions and API notes.

## Local setup

Requirements: Node.js 20+, pnpm 12+, and Docker Desktop.

```powershell
Copy-Item .env.example .env
pnpm install
docker compose up -d
pnpm typecheck
pnpm test
```

Docker is only needed for the local PostgreSQL and Redis services.

## Database package

The Prisma schema and initial migration live in [packages/db](./packages/db).
The package also includes a seed script for an admin account:

```powershell
pnpm --filter @codeorbit/db seed
```

The seed script expects `psql` on your PATH and uses `DATABASE_URL` from the environment.

The worker creates isolated BullMQ queues for each platform, contests, and reminders.
Each queue has its own rate limiter so an upstream platform failure cannot block the
other lanes.

## Quality checks

The CI workflow runs these checks locally:

```powershell
pnpm lint
pnpm typecheck
pnpm test
```

Pull requests and pushes to `main` or `master` run these checks automatically through
[`.github/workflows/ci.yml`](.github/workflows/ci.yml).

Prettier is available for local formatting with `pnpm format`. The current repository
contains legacy files that are not yet formatted, so formatting is not a CI gate.
