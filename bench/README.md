# @cellajs/bench

The bench package: [Artillery](https://www.artillery.io/) load testing for the backend, cdc, and yjs services, driven by the **bench CLI**.

### TL;DR

Bench load-tests your running development app with repeatable scenarios and seed data that can be
reset and reused. Test users are already signed in, so results focus on the endpoint under test.
Each run is saved and compared with the previous one: read results as trends, not absolutes.

## Prerequisites

Start these first (bench checks they are reachable and exits with guidance if not):

- **Postgres** seeded with app data (`pnpm docker` + `pnpm seed`)
- **Services** running via `pnpm dev`

## Commands

| Command | Description |
| --- | --- |
| `pnpm bench` | Interactive scenario picker |
| `pnpm bench <name>` | Run one scenario non-interactively |
| `pnpm bench --all` | Run every scenario in sequence (quiet, one summary at the end) |
| `pnpm bench --all --short` | Smoke run of every scenario (1s/1VU, no thresholds, no baselines) |
| `pnpm bench help` | List scenarios |
| `pnpm db:seed` | Seed test data (idempotent, cleans first) |
| `pnpm db:teardown` | Remove all bench data (baselines are kept) |

`--all` waits 15 seconds between scenarios so a saturating one does not slow the next. A single-scenario run stays verbose with a live comparison table. The Vitest smoke test `bench/src/tests/all-scenarios.test.ts` runs `--all --short` to catch broken scenarios and skips itself when the stack is down.

## Collaborative typing

`yjs-typing` measures the Yjs relay under people typing together. Artillery cannot speak the Yjs protocol, so its one VU runs `src/yjs-typing.ts`, which drives real y-websocket clients against the relay port. Each document is a bench attachment with a few typing clients and one idle viewer, and some users watch the SSE stream as non-editing viewers. Documents start spread over ten seconds, and every client is a user of its own.

```sh
pnpm bench yjs-typing                                  # through the CLI, with the CDC poller
pnpm -C bench yjs-typing --out report.json             # on its own, with a JSON report
YJS_DOCS=40 YJS_DURATION_S=60 pnpm bench yjs-typing    # another shape
```

| Variable | Default | Meaning |
| --- | --- | --- |
| `YJS_DOCS` | 20 | Documents edited at once |
| `YJS_TYPERS` | 3 | Typing clients per document |
| `YJS_DURATION_S` | 120 | Typing time |
| `YJS_KEYSTROKE_MS` | `200-300` | Spacing of one client's keystrokes |
| `YJS_SSE_VIEWERS` | one per document | Users on the SSE stream |
| `YJS_STAGGER_S` | 10 | Seconds over which documents start typing; 0 starts them together |
| `YJS_DOC_OFFSET` | 0 | First bench attachment: a second run on one database takes fresh documents |
| `YJS_PORT` | `devPorts.yjs` | The relay's port |

The report covers:

- **Latency.** From a keystroke to the document's viewer receiving it, and to the relay's `Saved` answer.
- **The log channel.** `pg_notify` per second on `yjs_log`, and how long a probe notification on it takes to arrive.
- **Materializations.** Writes of each document to its entity row per minute, the longest gap between them while typing, and the CDC activities and SSE notifications they cause.
- **The stack.** CPU, memory and database connections of the relay, API and CDC worker (found by port), the Postgres container's CPU, and the database's sessions, wait events, commits and WAL.
- **After typing.** How long until every edit is saved, the same on every client, and written to the entity row.

## Interpreting results

Bench measures the live dev stack. Before calling a result a regression:

- **Auth reads.** A session is read once per 10 seconds per browser and a token at every request. Memberships are cached per process until they change, so the first request of each user in a run also reads its memberships.
- **Per-mutation RLS transactions.** Each write wraps permission check + update in one short transaction that also sets tenant/user GUCs. The write ceiling is pool size (`DATABASE_POOL_MAX`) and DB round-trip latency, not handler CPU alone.
- **Rate limiting is effectively off.** The seeded bench tenant has a very high `apiPointsPerHour`, the points limiter has an in-process fast path, and every scenario starts with the bench users' per-user budgets (stream connects, sync reads) cleared.
- **Saturation.** At their configured arrival rates `attachment-edit`, `cdc-attachment` and `page-load` saturate a laptop that also runs the stack, so their thresholds fail on most runs. Compare medians and the trend between runs.
- **Telemetry is off without a key.** OpenTelemetry exports only when `MAPLE_SECRET_INGEST_KEY` is set.
