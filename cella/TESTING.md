# Testing

What the test suite is for, how to run it and where new tests belong.

### TL;DR

The suite's main job is to prove that attacks fail; a feature test is the exception. Every package runs on
[Vitest](https://vitest.dev) with one root setup, and `pnpm test` starts the Docker test database and runs it all.
Storybook UI tests run separately, in a browser.

## Goals

Verify every change with a Playwright run, a measurement or a check by hand that the PR description reports. Committing a test is a separate decision: a test earns its place when it proves an attack fails, reproduces a bug that shipped, pins a contract another module or an app depends on, or checks a table-driven rule too wide to eyeball. Judge a test by what it asserts: ask what has to change for it to fail, and if the answer is "the implementation", drop it. The usual mirror is one `it` per method or branch; branch tests that together guard one property, such as a cap, become one test of that property. The default for a performance, UI or refactor PR is zero new tests.

A security test acts as the attacker: it signs in as one user, tries to do something that user has no right to, and passes only when the app refuses. It checks for the exact refusal: the status code or Postgres error, no leaked rows, and any side effect such as a revoked grant. A matching test shows the rightful user still gets through, so an endpoint that refuses everyone can't pass. Name these tests after the attack (`must not leak attachments via another tenant's id`) and put the route-level ones in [backend/tests/security/](../backend/tests/security/). Every security fix adds a test that reproduces the exploit. The attacks we test against:

- **Crossing a boundary:** reading or writing another tenant's or organization's data, through the API or directly against the database under RLS.
- **Escalating a role:** a member doing what only an admin may, or setting fields the caller may not set.
- **Reusing what should be dead:** a revoked session, a deleted account, a replayed OAuth code, an expired or out-of-scope token.
- **Steering the app with attacker input:** open redirects, redirect URIs that aren't registered, unsafe URLs in content.
- **Leaking secrets:** hashes, token secrets or private keys appearing in responses, logs or the CDC stream.

A rule that holds for every route goes in [route-guards.test.ts](../backend/tests/security/route-guards.test.ts), which reads its table from the generated OpenAPI document, an app's routes included; `request-bodies.test.ts` beside it checks that every request body is required and bounded. An app tests its own entities in `*-app.test.ts` files. The backend suite also runs as `runtime_role` to exercise database policies ([Multi-tenancy](./MULTI_TENANCY.md#verification)).

## Running tests

```bash
pnpm test
```

It needs Docker running and `DB_TEST_PORT` in `backend/.env`, copied from `.env.example` during setup. The backend's test setup creates and migrates the test databases, so on a fresh server run the backend suite once before the `yjs` or `cdc` suite.

### Variants

| Command | What it does |
| --- | --- |
| `pnpm test` | Everything, with coverage summary (alias for `test:full`) |
| `pnpm test:full:verbose` | Same, plus passing test output |
| `pnpm test:core` | Skips integration tests (backend, yjs, cdc). Rarely needed (`test:core:verbose` for full output) |
| `pnpm test:storybook` | Storybook component tests in headless Chromium. Not part of `pnpm test` ([see below](#storybook)) |
| `pnpm app-shape:check` | The core suites again under a config shaped like an app's. Runs on the release PR |
| `pnpm story` | Interactive Storybook dev server. Runs no tests. |

The `TEST_MODE` env var selects `core` or `full`; a test can self-gate with `describe.skipIf(process.env.TEST_MODE !== 'full')`.

### Running a subset

Start the test database once (`pnpm docker:test`), then call vitest directly:

```bash
pnpm vitest run --project=backend            # one package
pnpm vitest run backend/tests/health.test.ts # one file
pnpm vitest run -t 'rate limiter'            # by test name
```

Packages without database access (`shared`, `infra`, `sdk`, most of `frontend`) run without Docker.

## Conventions

A branch that adds migrations runs its suite against a throwaway database (`DB_TEST_PORT=<port>` with a fresh container from the same image), never the shared test database other worktrees migrate. Tests that need the authorization server start it in-process with `backend/tests/oauth-helpers.ts`.

**Placement.** Pick by scope:

- _Unit tests_: next to the code, as `some-module.test.ts` or a `tests/` folder inside the module when there are several (e.g. [backend/src/lib/tests/](../backend/src/lib/tests/)).
- _Route/API-level tests_: the package's top-level `tests/` folder (e.g. [backend/tests/sign-in/](../backend/tests/sign-in/), [backend/tests/security/](../backend/tests/security/)).
- _Integration tests_: `tests/integration/`, the only tests excluded in `core` mode. Reserve for tests that need more than the test database (CDC replication slots, WebSocket servers, RLS against real roles).

Coverage excludes `*.test.ts`, `tests/**` and mocks, so placement does not change coverage numbers.

**Backend specifics.** Test env vars are preset in [backend/vitest.config.ts](../backend/vitest.config.ts): do not load `.env` in tests. Use the `#/` import alias as in source.

Backend test files run in parallel, each vitest worker on a database of its own, so files never see each other's rows. A worker's database keeps the rows of earlier files and runs: never assume it is empty, and clean up with `clearDatabase()`. A test that opens its own connection takes the URL from `shared/test-db`.

**App config.** A template test also runs in every app, on that app's hierarchy, surfaces, feature flags and policies. A test that needs a particular value states it and puts the app's back, with the helpers in `shared/testing/`. A fixture row carries every ancestor column the app's hierarchy gives the product, never the organization alone.

**New packages.** Register a new workspace package with tests in the root [vitest.config.ts](../vitest.config.ts): add it to `projects` and the `coverage.include` globs.

**Mutation hooks.** A product module's mutation hooks are tested under the app's own query client with the kit in `frontend/src/query/tests/mutation-hooks-kit.ts`, which also takes them offline and back. `attachment-mutation-hooks.test.ts` is the example.

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

Every story is render-tested in headless Chromium. Stories with `play` functions also get their interactions exercised. CI runs this project on the release PR only, so run `pnpm test:storybook` before merging a frontend change.
