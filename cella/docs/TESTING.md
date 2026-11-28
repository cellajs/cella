# Testing

This document explains what the [Vitest](https://vitest.dev) suite is for, how to run it and where new tests belong.

### TL;DR

The suite's main job is to prove that attacks fail; a feature test is the exception. Every package runs on Vitest
with one root setup, and `pnpm test` starts the Docker test database and runs it all. Storybook UI tests run
separately, in a browser.

## Goals

A committed test guards what must keep holding after its change ships. It earns its place when it does one of four things:

- proves an attack fails
- reproduces a bug that shipped
- pins a contract another module or an app depends on
- checks a table-driven rule too wide to eyeball

You verify every change separately, with a Playwright run, a measurement or a hand check reported in the PR description.

Judge a test by what makes it fail. If only a change to the implementation does, it mirrors the code: drop it. The usual mirror is one `it` per method or branch. Branch tests that together guard one property, such as a cap, become one test of that property. A performance, UI or refactor PR adds no tests by default.

### Security tests

A security test acts as the attacker. It signs in as one user, tries something that user may not do, and passes only when the app refuses. Say user A lists another tenant's attachments with A's session: the test expects a 403. A second test lists A's own attachments and expects a 200. An endpoint that refuses everyone then fails. Three rules apply to each one:

- It asserts the exact refusal: the status code or Postgres error, no leaked rows, and side effects such as a revoked grant.
- Its name is the attack, such as `must not leak attachments via another tenant's id`.
- Every security fix adds one that reproduces the exploit.

The suite proves these attacks fail:

- **Crossing a boundary:** another tenant's or organization's data, by API or in the database under RLS.
- **Escalating a role:** a member doing what only an admin may, or setting a field the caller may not.
- **Granting above yourself:** a role, invitation or membership an accept brings, above the granter's own.
- **Reusing what should be dead:** a revoked session, deleted account, replayed OAuth code or expired token.
- **Overreaching a scope:** an API key or access token used outside its scope.
- **Planting a sign-in address:** an attacker's address joins a victim's account through an accepted invitation.
- **Acting through a stale tab:** one user's idle tab replays queued writes after another user signs in.
- **Over-asking for scope:** an MCP client that starts with write scopes because the server named none.
- **Holding a stolen session:** a copied cookie that ends the owner's new sign-ins.
- **Outliving a session:** a sign-out that fails quietly, a link reopened after its session ended.
- **Proving with a dead key:** a token signed by a retired key, a forged key under a server key id, or none.
- **Claiming an address via federation:** an identity provider releasing an address outside its domains.
- **Steering the app with input:** open redirects, unregistered redirect URIs, unsafe URLs in content.
- **Assembling SQL from input:** a table name from a token, a sort key or search pattern reaching SQL text.
- **Steering the server's requests:** a client metadata URL or push endpoint aimed at a private address.
- **Leaking secrets:** hashes, token secrets or private keys in responses, logs or the CDC stream.
- **Leaking through an error:** a provider's tokens or claims logged through an error's cause.
- **Booting with published secrets:** a public tunnel signing cookies and Yjs relay tokens with `.env.example`.
- **Probing for accounts:** a callback, form or waitlist that answers a known address differently or slower.
- **Passing as another tab:** a copied source id that makes another user's tab take a write for its own and never fetch it.
- **Reading what was deleted:** a range fetch or catchup returning a deleted row its reader never saw live.
- **Bending the shared clock:** a future or maximum timestamp that makes other tenants' writes lose or fail.
- **Rendering what a user typed:** a name parsed as markup, an export formula, a co-editor's presence style.
- **Guessing a second factor slowly:** TOTP codes tried just under the lockout, for as long as it takes.
- **Serving a page from storage:** an uploaded HTML file opened from a presigned link.
- **Orphaning uploads:** files that no row can ever name.
- **Exhausting the server with shape:** a body, field, batch or document past its cap.
- **Exhausting a parser:** input that makes a parser or a regex work out of proportion.
- **Holding the stream open:** a stream that never reads, keeping the server's memory.
- **Outlasting a removal:** a stream that still gets frames of an organization its user left.
- **Mailing from the app's sender:** invitations, reminders, confirmations or alerts past their caps.
- **Waiting out a failure:** a database blip that ends a process.
- **Abusing the health page:** costly work or leaked error text, for anyone.
- **Creating without bounds:** tenants or push subscriptions created faster than any person would.
- **Racing the sign-in plumbing:** concurrent code requests, or sign-in starts that grow the cookie header.
- **Flooding the sign-in mail:** mail caps sidestepped by a known browser.

Rules for every route live in [route-guards.test.ts](../../backend/tests/security/route-guards.test.ts). They cover an app's routes too. `request-bodies.test.ts` beside it checks that every request body is required, bounded and names no server-only column. The backend suite also runs as `runtime_role` to exercise database policies.

## Running tests

```bash
pnpm test
```

### Variants

| Command | What it does |
| --- | --- |
| `pnpm test` | Everything, with a coverage summary |
| `pnpm test:core` | Skips only the integration tests. Rarely needed |
| `pnpm test:storybook` | Storybook component tests in headless Chromium. Not part of `pnpm test` ([see below](#storybook)) |
| `pnpm app-shape:check` | The core suites again under a config shaped like an app's. Runs on the release PR and nightly |

The `TEST_MODE` env var selects `core` or `full`. You gate a test to `full` with `describe.skipIf(process.env.TEST_MODE !== 'full')`.

### Running a subset

Start the test database once with `pnpm docker:test`, then call vitest directly:

```bash
pnpm vitest run --project=backend            # one package
pnpm vitest run backend/tests/health.test.ts # one file
pnpm vitest run -t 'rate limiter'            # by test name
```

On a fresh test database, run the backend suite first: it creates and migrates the databases the `yjs` and `cdc` suites use. Packages without database access, such as `shared` and `sdk`, run without Docker.

## Conventions

**Placement.** Pick by scope:

- _Unit tests_: next to the code, or in the module's `tests/` folder when there are several, as [backend/src/lib/tests/](../../backend/src/lib/tests/).
- _Route/API-level tests_: the package's `tests/` folder, as [backend/tests/sign-in/](../../backend/tests/sign-in/) and [backend/tests/security/](../../backend/tests/security/).
- _Integration tests_: `tests/integration/`, only for what needs replication slots, WebSockets or real roles.

**Backend specifics.** Test env vars are preset in [backend/vitest.config.ts](../../backend/vitest.config.ts). Do not load `.env` in tests. Use the `#/` import alias as in source.

Backend test files run in parallel, each worker on its own database. Never assume a worker's database is empty: it keeps rows from earlier files. Clean up with `clearDatabase()`. A test with its own connection takes the URL from `shared/test-db`.

The shared test database belongs to every worktree. On a branch that adds migrations, you test on a throwaway database on its own port, passed as `DATABASE_TEST_PORT`.

**App config.** A template test also runs in every app, on that app's config such as its hierarchy and policies. When a test needs a particular value, set it with the helpers in `shared/testing/`, then restore the app's. A fixture row fills every ancestor column the app's hierarchy gives the product, not only the organization. Your app tests its own entities in `*-app.test.ts` files.

**New packages.** Register a new workspace package with tests in the root [vitest.config.ts](../../vitest.config.ts): add it to `projects` and the `coverage.include` globs.

**Mutation hooks.** Test a product module's mutation hooks with the kit in `frontend/src/query/tests/mutation-hooks-kit.ts`. `attachment-mutation-hooks.test.ts` is the example.

## Storybook

Frontend components are also tested through stories, in Vitest browser mode with Playwright.

```bash
# one-time: install the browser
pnpm --filter frontend exec playwright install chromium

# stories import generated SDK types
pnpm sdk

# run the storybook test project
pnpm test:storybook
```

Each story's `play` function runs in its test. Run `pnpm test:storybook` before merging a frontend change. `pnpm story` starts the interactive Storybook dev server, which runs no tests.
