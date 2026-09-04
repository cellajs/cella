# Testing

<!-- Sync test marker: 2026-01-28-test-1 -->

How to run the test suite and where new tests belong.

### TL;DR

All package tests use [Vitest](https://vitest.dev) and share one root setup. `pnpm test` starts the
Docker test database and runs everything with a coverage summary. Storybook UI tests run separately
in a browser with `pnpm test:storybook`. Keep unit tests next to their source. Tests that need extra
services or network servers go in `tests/integration/`.

## Running tests

```bash
pnpm test
```

Uses the `db_test` service in [backend/compose.yaml](../backend/compose.yaml).

Requirements:

- Docker running
- `backend/.env` with `DB_TEST_PORT` set (copied from `.env.example` during setup). [shared/src/test-db.ts](../shared/src/test-db.ts) derives the test database URL from it

### Variants

| Command | What it does |
| --- | --- |
| `pnpm test` | Everything, with coverage summary (alias for `test:full`) |
| `pnpm test:full:verbose` | Same, plus passing test output |
| `pnpm test:core` | Skips integration tests (backend, yjs, cdc). Rarely needed (`test:core:verbose` for full output) |
| `pnpm test:storybook` | Storybook component tests in headless Chromium. Not part of `pnpm test` ([see below](#storybook)) |
| `pnpm story` | Interactive Storybook dev server. Runs no tests. |

The `TEST_MODE` env var selects `core` or `full`. In `core` mode the per-package vitest configs exclude `tests/integration/**`. A test can self-gate with `describe.skipIf(process.env.TEST_MODE !== 'full')`.

### Running a subset

Start the test database once (`pnpm docker:test`), then call vitest directly:

```bash
pnpm vitest run --project=backend            # one package
pnpm vitest run backend/tests/health.test.ts # one file
pnpm vitest run -t 'rate limiter'            # by test name
```

Packages without database access (`shared`, `infra`, `sdk`, most of `frontend`) run without Docker.

## Conventions

**Placement.** Pick by scope:

- _Unit tests_: next to the code, as `some-module.test.ts` or a `tests/` folder inside the module when there are several (e.g. [backend/src/lib/tests/](../backend/src/lib/tests/)).
- _Route/API-level tests_: the package's top-level `tests/` folder (e.g. [backend/tests/sign-in/](../backend/tests/sign-in/), [backend/tests/security/](../backend/tests/security/)).
- _Integration tests_: `tests/integration/`, the only tests excluded in `core` mode. Reserve for tests that need more than the test database (CDC replication slots, WebSocket servers, RLS against real roles).

Coverage excludes `*.test.ts`, `tests/**` and mocks, so placement does not change coverage numbers.

**Backend specifics.** Test env vars (secrets, `DATABASE_URL`, `NODE_ENV=test`) are preset in [backend/vitest.config.ts](../backend/vitest.config.ts). Do not load `.env` in tests. Backend tests run serially (`fileParallelism: false`) against a shared test database prepared by [backend/tests/global-setup.ts](../backend/tests/global-setup.ts). Never assume an empty database. Use the `#/` import alias as in source.

**New packages.** Register a new workspace package with tests in the root [vitest.config.ts](../vitest.config.ts): add it to `projects` and the `coverage.include` globs.

## Storybook

Frontend components are also tested through stories, using Vitest browser mode with Playwright (`@storybook/addon-vitest`).

```bash
# one-time: install the browser
pnpm --filter frontend exec playwright install chromium

# stories import generated SDK types
pnpm sdk

# run the storybook test project
pnpm test:storybook
```

Every story is render-tested in headless Chromium. Stories with `play` functions also get their interactions exercised. A new component story is a test automatically.
