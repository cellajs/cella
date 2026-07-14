# Testing Guide

<!-- Sync test marker: 2026-01-28-test-1 -->

All tests run on [Vitest](https://vitest.dev), orchestrated from the repo root via a single config ([vitest.config.ts](../vitest.config.ts)) with one project per package. Storybook is used for UI component testing.

## Running tests

```bash
pnpm test
```

This starts the test database (Docker, `db_test` service from [backend/compose.yaml](../backend/compose.yaml)), then runs all package tests in full mode with a coverage summary. Passing tests are silenced; only failures print output.

Requirements:

- Docker running
- `backend/.env` present with `DB_TEST_PORT` set (copied from `.env.example` during setup) — the test database URL is derived from it in [shared/src/test-db.ts](../shared/src/test-db.ts)

### Variants

| Command | What it does |
|---|---|
| `pnpm test` | Everything, with coverage summary (alias for `test:full`) |
| `pnpm test:full:verbose` | Same, but prints passing test output too |
| `pnpm test:core` | Skips integration tests (backend, yjs, cdc); rarely needed — `pnpm test` is fast enough for day-to-day (`test:core:verbose` for full output) |
| `pnpm test:storybook` | Storybook component tests in headless Chromium — not part of `pnpm test` ([see below](#storybook)) |
| `pnpm story` | Interactive Storybook dev server for writing stories; does not run tests |

`core` vs `full` is controlled by the `TEST_MODE` env var. In `core` mode the per-package vitest configs exclude `tests/integration/**`, and individual tests can self-gate with `describe.skipIf(process.env.TEST_MODE !== 'full')`.

### Running a subset

Start the test database once (`pnpm docker:test`), then invoke vitest directly:

```bash
pnpm vitest run --project=backend            # one package
pnpm vitest run backend/tests/health.test.ts # one file
pnpm vitest run -t 'rate limiter'            # by test name
```

Packages that don't touch the database (`shared`, `infra`, `sdk`, most of `frontend`) run without Docker.

## Conventions

**Placement.** Two patterns are in use — pick based on scope:

- *Unit tests*: colocate with the code they cover — either `some-module.test.ts` next to the source file, or a `tests/` folder inside the module directory when there are several files (e.g. [backend/src/lib/tests/](../backend/src/lib/tests/)).
- *Route/API-level tests*: in the package's top-level `tests/` folder (e.g. [backend/tests/sign-in/](../backend/tests/sign-in/), [backend/tests/security/](../backend/tests/security/)).
- *Integration tests*: in `tests/integration/` — these are the only tests excluded in `core` mode. Reserve this for tests that need more than the test database (CDC replication slots, spun-up WebSocket servers, RLS verification against real roles).

Coverage automatically excludes `*.test.ts`, `tests/**` folders and mocks, so placement doesn't affect coverage numbers.

**Backend specifics.** Test env vars (secrets, `DATABASE_URL`, `NODE_ENV=test`) are preset in [backend/vitest.config.ts](../backend/vitest.config.ts) — don't load `.env` in tests. Backend tests run serially (`fileParallelism: false`) against a shared test database prepared by [backend/tests/global-setup.ts](../backend/tests/global-setup.ts); write tests so they don't assume an empty database. Use the `#/` import alias as in source code.

**Don't over-gate.** A test that only needs the test database (or no database) belongs in the regular set. Only reach for `tests/integration/` + `TEST_MODE` gating when external moving parts are genuinely required.

**New packages.** When adding a workspace package with tests, register it in the root [vitest.config.ts](../vitest.config.ts): add it to `projects` and to the `coverage.include` globs.

## Storybook

Frontend components are also tested through Storybook stories, using Vitest browser mode with Playwright (`@storybook/addon-vitest`). **These are not part of `pnpm test`** — they run as a separate CI job and must be run explicitly locally:

```bash
# one-time: install the browser
pnpm --filter frontend exec playwright install chromium

# stories import generated SDK types
pnpm sdk

# run the storybook test project
pnpm test:storybook
```

`pnpm test:storybook` is the root shortcut for `pnpm --filter frontend exec vitest run --project=storybook`. Use `pnpm story` when you want the interactive Storybook dev server in a browser; it does not run the Vitest browser tests by itself.

Every story is render-tested in headless Chromium, and stories with `play` functions get their interactions exercised. When you add a frontend component story, it becomes a test automatically — no separate test file needed.
