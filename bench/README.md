# @cellajs/bench

This document covers the bench package: [Artillery](https://www.artillery.io/) load testing that keeps the backend, cdc, and yjs services performant, driven by the **bench CLI**.

### TL;DR

Bench load-tests your running development app with repeatable scenarios and test data that can
be safely reset and reused. Test users are already signed in, so the results focus on the endpoint
being tested. Each run is saved and compared with the previous one: read results as trends, not
absolutes.

## Prerequisites

Start these first (bench verifies they are reachable and exits with guidance if not):

- **Postgres** seeded with app data (`pnpm docker` + `pnpm seed`)
- **Services** running via `pnpm dev` (backend, cdc, yjs). CDC throughput is only measured with `DEV_MODE=full` (default).

## Commands

| Command | Description |
| --- | --- |
| `pnpm bench` | Interactive scenario picker |
| `pnpm bench <name>` | Run a specific scenario non-interactively |
| `pnpm bench --all` | Run every scenario in sequence (quiet, one summary at the end) |
| `pnpm bench --all --short` | Smoke run of every scenario (1s/1VU, no thresholds, no baselines) |
| `pnpm bench help` | List available scenarios |
| `pnpm db:seed` | Seed test data (idempotent, cleans first) |
| `pnpm db:teardown` | Remove all bench data (baselines are kept) |

`--all` runs each scenario with a short cooldown between them and prints one combined summary; a single-scenario run stays verbose with a live comparison table. A Vitest smoke test in `bench/src/tests/all-scenarios.test.ts` runs `--all --short` to catch broken scenarios and auto-skips when the stack is down.

## Interpreting results

Bench measures the live dev stack, so keep these constraints in mind before calling a result a regression:

- **Cache warm-up.** The auth guard caches sessions in-process (1 min TTL) and memberships separately (5 min TTL); runs shorter than the session TTL include cold-cache `validateSession` hits.
- **Per-mutation RLS transactions.** Each write wraps permission check + update in one short-lived transaction that also sets tenant/user GUCs. The write ceiling is bound by pool size (`DATABASE_POOL_MAX`) and DB round-trip latency, not just handler CPU.
- **Rate limiting is effectively off.** The seeded bench tenant sets a very high `apiPointsPerHour`, and the points limiter has an in-process fast path.
- **Telemetry is off without a key.** OpenTelemetry only exports when `MAPLE_SECRET_INGEST_KEY` is set.
