# Testing

What the test suite is for, how to run it and where new tests belong.

### TL;DR

The suite's main job is to prove that attacks fail; a feature test is the exception. Every package runs on
[Vitest](https://vitest.dev) with one root setup, and `pnpm test` starts the Docker test database and runs it all.
Storybook UI tests run separately, in a browser.

## Goals

Verify every change with a Playwright run, a measurement or a hand check, and report it in the PR description. Committing a test is a separate choice. A test earns its place when it does one of four things:

- proves an attack fails
- reproduces a bug that shipped
- pins a contract another module or an app depends on
- checks a table-driven rule too wide to eyeball

Judge a test by what makes it fail. If only a change to the implementation does, drop it. The usual mirror is one `it` per method or branch. Branch tests that together guard one property, such as a cap, become one test of that property. A performance, UI or refactor PR adds no tests by default.

A security test acts as the attacker. It signs in as one user, tries something that user may not do, and passes only when the app refuses. It asserts the exact refusal: the status code or Postgres error, no leaked rows, and side effects such as a revoked grant.

A second test shows the rightful user still gets through. An endpoint that refuses everyone then fails.

Name the test after the attack, such as `must not leak attachments via another tenant's id`. Route-level ones go in [backend/tests/security/](../backend/tests/security/). Every security fix adds a test that reproduces the exploit.

The attacks we test against:

- **Crossing a boundary:** another tenant's or organization's data, by API or in the database under RLS.
- **Escalating a role:** a member doing what only an admin may, or setting a field the caller may not.
- **Granting above yourself:** a role, invitation or membership an accept brings, above the granter's own.
- **Reusing what should be dead:** a revoked session, deleted account, replayed OAuth code or expired token.
- **Overreaching a scope:** a token used outside its scope.
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
- **Booting with published secrets:** a public tunnel signing cookies and relay tokens with `.env.example`.
- **Probing for accounts:** a callback, form or waitlist that answers a known address differently or slower.
- **Passing as another tab:** a copied source id that makes another user's tab take a write as its echo and never fetch it.
- **Reading what was deleted:** a range read or catch-up returning a deleted row its reader never saw live.
- **Bending the shared clock:** a future or maximum stamp that makes other tenants' writes lose or fail.
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

Rules for every route live in [route-guards.test.ts](../backend/tests/security/route-guards.test.ts). It reads its table from the generated OpenAPI document. An app's routes are therefore covered too. `request-bodies.test.ts` beside it checks that every request body is required, bounded and names no server-only column. An app tests its own entities in `*-app.test.ts` files. The backend suite also runs as `runtime_role` to exercise database policies.

## Running tests

```bash
pnpm test
```

### Variants

| Command | What it does |
| --- | --- |
| `pnpm test` | Everything, with a coverage summary, through `test:full` |
| `pnpm test:core` | Skips only the integration tests. Rarely needed. A direct vitest run without `--silent=passed-only` shows full output |
| `pnpm test:storybook` | Storybook component tests in headless Chromium. Not part of `pnpm test` ([see below](#storybook)) |
| `pnpm app-shape:check` | The core suites again under a config shaped like an app's. Runs on the release PR |
| `pnpm story` | Interactive Storybook dev server. Runs no tests. |

The `TEST_MODE` env var selects `core` or `full`. A test can self-gate with `describe.skipIf(process.env.TEST_MODE !== 'full')`.

### Running a subset

Start the test database once with `pnpm docker:test`, then call vitest directly:

```bash
pnpm vitest run --project=backend            # one package
pnpm vitest run backend/tests/health.test.ts # one file
pnpm vitest run -t 'rate limiter'            # by test name
```

On a fresh test database, run the backend suite first. It creates and migrates the databases the `yjs` and `cdc` suites use. Packages without database access, such as `shared` and `sdk`, run without Docker.

## Conventions

The shared test database belongs to every worktree. A branch that adds migrations therefore tests on a throwaway database. It runs a fresh container from the same image, on its own port passed as `DATABASE_TEST_PORT`.

**Placement.** Pick by scope:

- _Unit tests_: next to the code, or in the module's `tests/` folder when there are several, as [backend/src/lib/tests/](../backend/src/lib/tests/).
- _Route/API-level tests_: the package's `tests/` folder, as [backend/tests/sign-in/](../backend/tests/sign-in/) and [backend/tests/security/](../backend/tests/security/).
- _Integration tests_: `tests/integration/`, only for what needs replication slots, WebSockets or real roles.

**Backend specifics.** Test env vars are preset in [backend/vitest.config.ts](../backend/vitest.config.ts). Do not load `.env` in tests. Use the `#/` import alias as in source.

Backend test files run in parallel, each worker on its own database. Parallel files never see each other's rows. A worker's database keeps rows from earlier files, so never assume it is empty. Clean up with `clearDatabase()`. A test with its own connection takes the URL from `shared/test-db`.

**App config.** A template test also runs in every app, on that app's config such as its hierarchy and policies. A test that needs a particular value sets it with the helpers in `shared/testing/`, then restores the app's. A fixture row fills every ancestor column the app's hierarchy gives the product, not only the organization.

**New packages.** Register a new workspace package with tests in the root [vitest.config.ts](../vitest.config.ts): add it to `projects` and the `coverage.include` globs.

**Mutation hooks.** Test a product module's mutation hooks with the kit in `frontend/src/query/tests/mutation-hooks-kit.ts`. It runs them under the app's query client, offline and back. `attachment-mutation-hooks.test.ts` is the example.

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

Every story is render-tested in headless Chromium. A story's `play` function runs too. CI runs this project on the release PR only. Run it yourself before merging a frontend change.
