# @cellajs/bench

Artillery load testing to keep services such as backend, cdc and yjs performant. 

## Overview

1. **Runs against your dev DB with idempotent seed data.** Seeds deterministic test data (`xbench-*` / zero-prefixed UUIDs); each run cleans prior bench rows before re-seeding.
2. **Scenarios are declarative.** Each is a YAML file under `scenarios/` backed by a TypeScript processor — see [How it works](#how-it-works).
3. **Auth is pre-seeded, no warmup.** VUs build cookies from deterministic session tokens without hitting the sign-in endpoint, so load lands on the endpoint under test.
4. **Every run is a baseline.** Results are saved automatically to `.baselines/<scenario>.json` and compared against the previous run — no flags needed.

## Prerequisites

Start these before running bench — it verifies they are reachable and exits with guidance if not:

- **Postgres** running and seeded with app data (`pnpm docker` + `pnpm seed`)
- **Services** running with `pnpm dev` (backend, cdc, yjs). CDC throughput is only measured when `DEV_MODE=full` (the default).

## Quick start

```bash
# Interactive CLI — pick a scenario (seeds DB in background)
pnpm bench

# Or run a specific scenario directly (CI-friendly)
pnpm bench attachment-edit
```

## Commands

| Command | Description |
|---------|-------------|
| `pnpm bench` | Interactive scenario picker (seeds DB in background) |
| `pnpm bench <name>` | Run a specific scenario non-interactively |
| `pnpm bench <name> --skip-seed` | Run a scenario, skipping the DB seed |
| `pnpm bench help` | List available scenarios |
| `pnpm db:seed` | Seed test data (idempotent, cleans first) |
| `pnpm db:teardown` | Remove all bench data from db (baselines are kept) |

## How it works

**Data seeding** (`data-setup.ts`) auto-discovers self-registering `*.bench.ts` modules under `src/seeds/` and inserts test data directly via SQL with a `pg` pool. Those `*.bench.ts` files are seed entrypoints: they register which tables to seed and typically call shared seed helpers in the same folder such as `user.ts`, `organization.ts`, `ids.ts`, and `session-auth.ts`. Bench rows use deterministic UUID variants or `xbench`/`lt-` identifiers for cleanup. The seed is idempotent — it cleans existing bench data before re-inserting. Sessions are pre-seeded with deterministic tokens so VUs can authenticate instantly without hitting the sign-in endpoint.

**Scenarios** are YAML files in `scenarios/` that define load phases, thresholds, and HTTP flows using Artillery format. Each scenario references a TypeScript processor in `src/processors/` for runtime logic that happens during the load test itself, such as authentication or building request payloads.

**Processors** are plain Node.js/TypeScript modules that export functions used by YAML scenarios. Unlike seed modules, they do not seed the database; they run while Artillery is executing a scenario:
- `beforeScenario` hooks (e.g., `authenticate`) run once per virtual user
- `function` steps (e.g., `buildAttachmentEditPayload`) set `context.vars` for the next HTTP request

**Authentication** uses pre-seeded sessions. This eliminates the auth warmup phase entirely — VUs are authenticated from deterministic session tokens, so load lands directly on the endpoint under test.

**Baselines** are written automatically after every run. Each run appends its aggregate metrics (request rate, mean/p95/p99, errors, failed VUs) to `.baselines/<scenario>.json` and prints a comparison against the previous run. The directory is gitignored, so baselines stay local. Delete a scenario's file to reset its history.

## File structure

```
bench/
├── scenarios/                  # Artillery YAML scenario definitions (one per endpoint)
├── src/
│   ├── bench-cli.ts            # Orchestrator: preflight check, seed, run, baseline compare
│   ├── data-setup.ts           # Auto-discovers src/seeds/*.bench.ts, seeds via pg pool
│   ├── cdc-poller.ts           # Background CDC throughput/latency sampler
│   ├── seed-utils.ts           # Shared seeding helpers
│   ├── registry.ts             # Collects self-registered seed modules
│   ├── config.ts               # Target host, DB connection, bench constants
│   ├── seeds/                  # Seed entrypoints (*.bench.ts) plus shared seed helpers/IDs
│   └── processors/             # Runtime Artillery code: auth hooks and request builders
└── .baselines/                 # Per-scenario run history (gitignored)
```
