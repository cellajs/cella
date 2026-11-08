---
name: verify
description: Build, launch, and drive the cella frontend to verify UI changes at runtime.
---

# Verifying cella frontend changes

## Launch

- Dev server: `cd frontend && pnpm dev` (plain HTTP). The main checkout serves `appConfig.frontendUrl`, http://localhost:3000 for app number 0; a linked git worktree runs on ports of its own, which Vite prints ([Dev ports](../../../shared/README.md#dev-ports)). Marketing pages (`/about`, `/features`, `/sync-engine`, `/docs`) render without the backend; the "Offline · Connection lost" toast without a backend is expected, not a regression.
- Never pass `--port`, and never start a server on the main checkout's ports from a worktree: the app URLs come from the config, so a server on another port fails with "Failed to fetch". Ports of another `devAppIndex` belong to other apps.
- The configured ports are the developer's, in the main checkout too. Use the stack that answers on `appConfig.frontendUrl`, ask the developer to start it, or run your own with `DEV_PORT_OFFSET=50 pnpm dev` on the shared database (one CDC worker reads its slot: the second stack shows no live updates) or as a [throwaway stack](#a-throwaway-database). Keep it attached to your session, never `nohup`, and end it with `DEV_PORT_OFFSET=50 pnpm killports`: a stack left behind blocks the developer's `pnpm dev`.
- A worktree's Vite proxies `/api` to the worktree's own backend, which migrates the database named in `.env` on boot: the main checkout's, unless the worktree has its own. Give a branch with migrations its own database first ([A throwaway database](#a-throwaway-database)), and never run a second CDC worker on a shared one: it waits for the slot the running one holds and reports degraded meanwhile.
- When you start the stack yourself, capture its stdout with a size cap: `pnpm dev 2>&1 | head -c 200000000 > <scratch>/dev-stack.log` (background; macOS `head` takes bytes only). pino writes no file, and backend errors are there.
- Stack health: the API's `/health?depth=full` shows the `cdc` component `healthy`, or the `reason` it is not. The worker's own `curl http://localhost:<services.cdc.port>/health?depth=full` adds `replication.status` (`active` while it reads), `setupProblems` and `failure`.
- Typecheck: `cd frontend && pnpm ts` (tsgo). Lint: `pnpm exec biome check <file>` from repo root.

## Worktree stacks

At most two worktrees run a stack at once, on the shared database or a throwaway one: each holds memory and CPU, and each throwaway database holds a volume in Docker. Before starting one, list the checkouts that serve a port and the database containers:

```sh
for p in $(lsof -a -c node -iTCP -sTCP:LISTEN -t); do lsof -a -p "$p" -d cwd -Fn | sed -n 's/^n//p'; done | sort -u
docker ps --format '{{.Names}}  {{.Ports}}'
```

- Paths under `.claude/worktrees/<name>/` (or another linked worktree) count, the main checkout does not. With two worktrees listed, check without a stack (typecheck, unit tests, a static page) or wait.
- Once the check is done, `pnpm killports` from the worktree ends its listeners, and `docker rm -fv <name>` removes a throwaway container with its volume.

## A throwaway database

Clean seeded data, or a branch with migrations, beside the stack you already run. `pnpm cella testbed` is the short way: the whole app with a built frontend, the workers and the relay, on its own database that every start migrates. `pnpm cella testbed -- <command>` runs a command against it and stops it after. One testbed runs per app on a machine. The stack below is for a Vite dev server, or a database of a worktree's own.

Variables in the environment win over `.env`, so nothing in the checkout changes. Offset 50 and port 5440 are free, and a second throwaway stack takes offset 60, port 5450 and a container name of its own: the testbed takes 70 and 5470, and linked worktrees take the hundreds. Offset 40 puts a service on port 4045, which `fetch` refuses, so the config will not build.

```sh
# The image `pnpm docker` built (`docker images | grep db`), with the `-c` flags of `db` in backend/compose.yaml
docker run -d --name scratch_db -e POSTGRES_PASSWORD=postgres -p 127.0.0.1:5440:5432 <image> -c wal_level=logical -c shared_preload_libraries=pg_cron -c cron.database_name=postgres

export DEV_PORT_OFFSET=50 ADMIN_EMAIL=admin-test@cellajs.com SYSTEM_ADMIN_IP_ALLOWLIST='*'
export DATABASE_URL=postgres://runtime_role:dev_password@0.0.0.0:5440/postgres
export DATABASE_ADMIN_URL=postgres://postgres:postgres@0.0.0.0:5440/postgres
export DATABASE_CDC_URL=postgres://admin_role:dev_password@0.0.0.0:5440/postgres

pnpm seed                                                                  # migrates, then seeds
(cd backend && NODE_ENV=development pnpm exec tsx src/main.ts) &            # the API, 50 ports up
(cd frontend && NODE_ENV=development pnpm exec vite --mode development) &   # the app, 50 ports up
```

- Every command runs with those exports: `pnpm seed` without them seeds the database you work in. An agent's shell keeps no exports between calls, so put them in a wrapper script that ends in `exec "$@"` and run each command through it.
- The API and Vite serve pages and writes. Nothing here starts the CDC worker or the relay, so pages get no live updates.
- Both Vite servers share `frontend/node_modules/.vite`: the second re-bundles the dependencies there, and the first re-bundles once more at its next start.
- Afterwards `DEV_PORT_OFFSET=50 pnpm killports` and `docker rm -fv scratch_db`.

## Drive (browser)

- Playwright is a `frontend` devDependency, and Node resolves a bare import from the script file's own folder, so a scratch script outside the repo fails with `ERR_MODULE_NOT_FOUND`. Keep it in `.scratch/` at the repo root and take Playwright from `@cellajs/cli/drive`: `const { chromium } = await loadPlaywright()` loads the frontend's copy, as the drivers under `cella/skills/` do. Chromium cache: `~/Library/Caches/ms-playwright`.
- Signed-in pages: mint a session, with no UI login and no cookie built by hand (the app signs every cookie). `pnpm --filter backend session:mint <email>` ([backend scripts](../../../backend/scripts/README.md)) prints `<cookie name>=<signed value>` and a curl line with the API URL. Sign in as `agent-test@cellajs.com`, a system admin seeded with the admin's memberships: the admin (`ADMIN_EMAIL` in `.env`) is the developer's own user, whose per-user rate limits, sessions and unseen marks a driver would spend. `pnpm seed agent` adds it to a database seeded before it. Either acts as a system admin from an address in `SYSTEM_ADMIN_IP_ALLOWLIST` there: a `.env` copied from `.env.example` allows this machine. Set the cookie with `context.addCookies([{ name, value, url: <appConfig.frontendUrl> }])`; the API is same-origin, under `<frontendUrl>/api`.
- When the script is done, sign the session out (`POST <api>/auth/sign-out` with the cookie and a JSON content type), or it stays listed as live in the user's sessions until it expires. In a driver: `mintSession(email)` and `signOut(session)` from `@cellajs/cli/drive`; with a testbed's environment (`pnpm cella testbed -- node .scratch/<script>.mjs`) the mint signs in on its database and the session carries its URLs.
- A freshly seeded admin opens on the onboarding dialog: `PATCH <api>/me` with `{ userFlags: { finishedOnboarding: true } }` skips it, as the drivers do.
- Boot smoke of a checkout or a new app: `node cella/skills/verify/smoke-driver.mjs` from the repo root starts `pnpm dev`, waits for a healthy stack with an active CDC replication, signs in as `ADMIN_EMAIL` through the magic link the backend prints, opens `/home` and an organization's attachments (seeded rows expected), then stops the stack. `START=` attaches to a stack that already runs and has no log to read the link from, so it leaves the magic link out; `OUT_DIR` holds the stack log, screenshots and `evidence.json`. The nightly `create-flow.yml` workflow in [create-cella](https://github.com/cellajs/create-cella/blob/main/.github/workflows/create-flow.yml) runs it on a new app from a cella clone it never installs: keep its interface stable, and keep it on the app's own Playwright, never on `@cellajs/cli/drive`.
- Realtime behavior across two tabs (entity sync, collaborative descriptions): the `two-tab-sync-test` skill and its driver.
- The on-screen keyboard, the visual viewport, editing text on a phone or real touch scrolling: the `android-emulator` skill. Desktop Chromium with a phone viewport shows none of these.
- Breakpoints come from `appConfig.theme.screenSizes`, not Tailwind's defaults: cella adds `xs` 420 and sets `2xl` to 1400. `useBreakpointBelow('sm')` is strict `< 640`.

## Gotchas

- `use-scroll-visibility.ts` ignores single-frame scroll jumps > 150px (`maxGestureDelta`) and has a 500ms initial cooldown, so `window.scrollBy(0, 1000)` will NOT hide floating nav buttons. Simulate gestures: repeated `page.mouse.wheel(0, ~100)` ticks at ~60ms intervals, after waiting ~1s post-load.
- Floating nav buttons: `#floating-nav` container, item ids like `marketing-menu` / `docs-menu`; hidden = `opacity-0` class on the button. A list's main action floats outside it as `#floating-action`.
- Auth routes (check-email, magic links, SSO) run `isNoBot` (`backend/src/middlewares/is-no-bot.ts`), which answers 400 `maybe_bot` to headless Chromium's `HeadlessChrome` user agent. A script that walks the auth flow sets `userAgent` on its context to the same string without `Headless`.
- The dev-mode "Sign in as the seeded admin" banner, fixed to the bottom of public pages, can overlap bottom-anchored UI in screenshots.
