# CodeOrbit API foundation

The P0 API exposes:

- `GET /health` — process health check
- `POST /auth/session-sync` — internal Auth.js callback to upsert a user
- `GET /api/v1/me` — protected authentication smoke-test endpoint; returns the JWT subject and role
- `PATCH /api/v1/me` — update profile display name, username, timezone, or bio
- `DELETE /api/v1/me` — permanently delete the authenticated user's data
- `POST /api/v1/onboarding` — complete the authenticated user's initial profile setup
- `GET /api/v1/accounts` — list the authenticated user's linked platform accounts
- `POST /api/v1/accounts` — validate and link a public platform handle, then enqueue its first sync
- `POST /api/v1/accounts/:id/sync` — manually enqueue a sync after the 60-second cooldown
- `DELETE /api/v1/accounts/:id` — unlink an account owned by the authenticated user
- `GET /api/v1/dashboard` — return the authenticated user's aggregate progress summary
- `GET /api/v1/dashboard/heatmap?platform=&from=&to=` — return daily UTC activity counts
- `GET /api/v1/dashboard/charts?months=` — return difficulty, topic, rating, and monthly chart data
- `GET /api/v1/contests?platform=&from=&to=` — list upcoming contests
- `GET /api/v1/contests.ics?platform=&from=&to=` — export upcoming contests as iCalendar
- `GET /api/v1/contests/:contestId/reminders` — list the authenticated user's reminders
- `PUT /api/v1/contests/:contestId/reminders` — replace reminder offsets (`5`, `30`, `60`, or `1440` minutes)
- `GET /api/v1/admin/sync/status` — admin-only queue counts and kill-switch state
- `PUT /api/v1/admin/kill-switch` — admin-only sync pause/resume (`{ "enabled": true|false }`)
- `POST /api/v1/admin/accounts/:id/sync` — admin-only force sync with a platform body
- Standard JSON errors for unknown routes:
  `{ "error": { "code": "NOT_FOUND", "message": "...", "details": {} } }`

Protected routes require `Authorization: Bearer <JWT>`. JWTs must use `HS256`, include a
string `sub` claim, and must not be expired. Invalid or missing tokens return:

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "A valid bearer token is required",
    "details": {}
  }
}
```

`POST /auth/session-sync` requires the `X-Internal-API-Secret` header and a JSON body
containing `id`, `email`, `username`, and `displayName`. The internal secret is never
accepted as a bearer token.

Account linking accepts `{ "platform": "codeforces", "handle": "tourist" }`. The
platform adapter validates the handle before persistence. Manual sync returns `429
SYNC_COOLDOWN` when the account was synced within the previous 60 seconds and
`409 SYNC_IN_PROGRESS` when a sync is already running. Account operations are
scoped to the authenticated JWT subject.

`GET /api/v1/dashboard` returns total solved problems, solved-by-difficulty counts,
current and longest UTC-day streaks, active days and submission contributions from
the last year, daily activity, and the latest per-platform summaries. The current
streak may continue through yesterday so a user does not lose it at midnight before
their next activity is recorded.

`GET /api/v1/dashboard/heatmap` returns a complete inclusive range of UTC days,
including zero-activity days. The optional platform filter is applied by the
repository. Ranges default to the last 365 days and cannot exceed 366 days.
Clients must display day labels in the user's timezone without changing the API's
UTC day keys.

`GET /api/v1/dashboard/charts` defaults to 12 months and accepts a range from 1
to 24 months. It returns normalized data for difficulty distribution, topic
coverage, rating history, and monthly submissions/accepted counts.

CodeChef and GeeksforGeeks adapters are disabled by default. Set
`ENABLE_CODECHEF_ADAPTER=true` and/or `ENABLE_GFG_ADAPTER=true` before constructing
the adapter registry. These adapters currently expose profile totals only; submission
history, activity calendars, and rating history remain unavailable until the upstream
markup provides stable fields.

Contest queries default to a 45-day window and cannot exceed 45 days. The iCalendar
export uses UTC timestamps and escapes event text according to RFC 5545.

Feature endpoints will be added phase-by-phase under `/api/v1` as specified in the PRD.
