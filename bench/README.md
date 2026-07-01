# @cellajs/bench

Artillery load testing to keep services (backend, cdc, yjs) performant.

Runs against your dev stack with idempotent, deterministic seed data. Auth is pre-seeded (VUs build cookies from seeded session tokens, no sign-in warmup), so load lands on the endpoint under test. Every run is saved to `.baselines/<scenario>.json` and compared against the previous one.

## Prerequisites

Start these first — bench verifies they are reachable and exits with guidance if not:

- **Postgres** seeded with app data (`pnpm docker` + `pnpm seed`)
- **Services** running via `pnpm dev` (backend, cdc, yjs). CDC throughput is only measured with `DEV_MODE=full` (default).

## Commands

| Command | Description |
|---------|-------------|
| `pnpm bench` | Interactive scenario picker |
| `pnpm bench <name>` | Run a specific scenario non-interactively |
| `pnpm bench --all` | Run every scenario in sequence (quiet, one summary at the end) |
| `pnpm bench --all --short` | Smoke run of every scenario (1s/1VU, no thresholds, no baselines) |
| `pnpm bench help` | List available scenarios |
| `pnpm db:seed` | Seed test data (idempotent, cleans first) |
| `pnpm db:teardown` | Remove all bench data (baselines are kept) |

`--all` runs each scenario with a short cooldown between them and prints one combined summary; a single-scenario run stays verbose with a live comparison table. A Vitest smoke test (`src/tests/all-scenarios.test.ts`) runs `--all --short` to catch broken scenarios and auto-skips when the stack is down.

## Interpreting results

Bench measures the live dev stack, so keep these constraints in mind before calling a result a regression:

- **Cache warm-up.** The auth guard caches sessions in-process (1 min TTL) and memberships separately (5 min TTL); runs shorter than the session TTL include cold-cache `validateSession` hits.
- **Per-mutation RLS transactions.** Each write wraps permission check + update in one short-lived transaction that also sets tenant/user GUCs. The write ceiling is bound by pool size (`DATABASE_POOL_MAX`) and DB round-trip latency, not just handler CPU.
- **Rate limiting is effectively off.** The seeded bench tenant sets a very high `apiPointsPerHour`, and the points limiter has an in-process fast path.
- **Telemetry is off without a key.** OpenTelemetry only exports when `MAPLE_SECRET_INGEST_KEY` is set.
