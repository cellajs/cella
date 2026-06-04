# Bench

Artillery load testing suite for the Cella backend.

## Prerequisites

- Docker (for PostgreSQL)
- Backend running on `localhost:4000`

## Quick start

```bash
# Start DB + seed test data (1200 users, org, attachments, memberships)
pnpm db:up

# Start the backend (in another terminal)
cd .. && pnpm dev

# Interactive CLI — pick a scenario (seeds DB in background)
pnpm bench

# Or run a specific scenario directly (CI-friendly)
pnpm bench -- --scenario attachment-edit

# Skip re-seeding if DB is already prepared
pnpm bench -- --scenario attachment-edit --skip-seed

# Clean up test data
pnpm db:teardown
```

## Commands

| Command | Description |
|---------|-------------|
| `pnpm bench` | Interactive scenario picker (seeds DB in background) |
| `pnpm bench -- --scenario <name>` | Run a specific scenario non-interactively |
| `pnpm bench -- --skip-seed` | Skip DB seed (use with `--scenario`) |
| `pnpm bench -- --poller` | Start CDC health poller alongside any scenario |
| `pnpm db:up` | Start Postgres, wait for ready, seed test data |
| `pnpm db:seed` | Seed test data (idempotent, cleans first) |
| `pnpm db:teardown` | Remove all bench data |

## How it works

**Data seeding** (`data-setup.ts`) inserts test data directly via SQL with a `pg` pool. All IDs use `xbench-` prefixes for deterministic cleanup. The seed is idempotent — it cleans existing bench data before re-inserting. Sessions are pre-seeded with deterministic tokens so VUs can authenticate instantly without hitting the sign-in endpoint.

**Scenarios** are YAML files in `scenarios/` that define load phases, thresholds, and HTTP flows using Artillery's declarative syntax. Each scenario references a TypeScript processor in `src/processors/` for custom logic (authentication, payload generation).

**Processors** are plain Node.js/TypeScript modules that export functions used by YAML scenarios:
- `beforeScenario` hooks (e.g., `authenticate`) run once per virtual user
- `function` steps (e.g., `buildAttachmentEditPayload`) set `context.vars` for the next HTTP request

**Authentication** uses pre-seeded sessions — the auth processor builds cookies from deterministic tokens without any HTTP calls. This eliminates the auth warmup phase entirely. The `sign-in` scenario is the dedicated benchmark for testing sign-in throughput.

**CDC health poller** (`src/cdc-poller.ts`) runs as a standalone script alongside CDC scenarios, polling `localhost:4001/health?depth=full` and logging throughput/latency metrics.

## Writing a new scenario

1. Create `scenarios/my-scenario.yaml`:

```yaml
config:
  target: "{{ $processEnvironment.BASE_URL | default 'http://localhost:4000' }}"
  processor: "../src/processors/my-scenario.ts"
  phases:
    - duration: 10
      arrivalRate: 5
      rampTo: 50
      name: "ramp up"
    - duration: 30
      arrivalRate: 50
      name: "steady"
    - duration: 10
      arrivalRate: 50
      rampTo: 0
      name: "ramp down"
  plugins:
    ensure:
      thresholds:
        - http.response_time.p95: 500

scenarios:
  - beforeScenario: "authenticate"
    flow:
      - function: "buildPayload"
      - get:
          url: "/my-endpoint"
          headers:
            cookie: "{{ cookie }}"
```

2. Create `src/processors/my-scenario.ts`:

```typescript
export { authenticate } from './auth';

export function buildPayload(context, events, done) {
  context.vars.myVar = 'value';
  done();
}
```

3. Run it:

```bash
pnpm bench -- --scenario my-scenario
```

### Adding test data

If your scenario needs new entity types, add a generator in `src/generators/` and call it from `data-setup.ts`. Generators produce records with `xbench-` prefixed IDs. Use `recordToRow()` to map camelCase records to snake_case SQL columns.

## Data overview

| Entity | Count | ID pattern |
|--------|-------|------------|
| Users | 1,200 | `xbench-user-*` |
| Passwords | 1,200 | `xbench-pass-*` |
| Emails | 1,200 | `xbench-email-*` |
| Tenant | 1 | `xbench` |
| Organization | 1 | `xbench-org-*` |
| Attachments | 500 | `xbench-atch-*` |
| Memberships | 1,200 | `lt-*` (org) |

## Configuration

Override via environment variables:

```bash
BASE_URL=http://staging:4000 pnpm bench -- --scenario attachment-edit
PG_HOST=db.example.com PG_PORT=5432 pnpm db:seed
```

## File structure

```
bench/
├── scenarios/                  # Artillery YAML scenario definitions
│   ├── page-load.yaml
│   ├── get-me.yaml
│   ├── attachment-edit.yaml
│   └── sign-in.yaml
├── src/
│   ├── bench-cli.ts            # Interactive CLI entry point
│   ├── cdc-poller.ts           # Standalone CDC health metrics poller
│   ├── config.ts               # Shared constants and IDs
│   ├── data-setup.ts           # DB seeding script (runs via tsx)
│   ├── generators/             # Test data generators (users, attachments, sessions)
│   └── processors/             # Artillery processor functions
│       ├── auth.ts             # Pre-seeded session cookie builder
│       ├── sign-in.ts          # Sign-in payload builder
│       └── attachment-edit.ts  # Attachment edit payload builder
└── results/                    # Output directory (gitignored)
```
