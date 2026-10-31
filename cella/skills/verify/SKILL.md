---
name: verify
description: Build, launch, and drive the cella frontend to verify UI changes at runtime.
---

# Verifying cella frontend changes

## Launch

- Dev server: `cd frontend && pnpm dev` (plain HTTP). The main checkout serves http://localhost:3000; a linked git worktree runs on ports of its own, which Vite prints ([Dev ports](../../../shared/README.md#dev-ports)). Marketing pages (`/about`, `/features`, `/sync-engine`, `/docs`) render without the backend; the "Offline · Connection lost" toast without a backend is expected, not a regression.
- Never pass `--port`, and never start a server on the main checkout's ports from a worktree: the app URLs come from the config, so a server on another port fails with "Failed to fetch". 3020/4020 and the like belong to other apps (projectcampus).
- A worktree's Vite proxies `/api` to the worktree's own backend, which migrates the database named in `backend/.env` on boot: the main checkout's, unless the worktree has its own. Give a branch with migrations its own database first ([A throwaway database](#a-throwaway-database)), and never run a second CDC worker on a shared one: it waits for the slot the running one holds and reports degraded meanwhile.
- When you start the stack yourself, capture its stdout: `pnpm dev > <scratch>/dev-stack.log 2>&1` (background). pino writes no file, and backend errors are there.
- Stack health: the API's `/health?depth=full` shows the `cdc` component `healthy`, or the `reason` it is not. The worker's own `curl http://localhost:<devPorts.cdcHealth>/health?depth=full` adds `replication.status` (`active` while it reads), `setupProblems` and `failure`.
- Typecheck: `cd frontend && pnpm ts` (tsgo). Lint: `pnpm exec biome check <file>` from repo root.

## A throwaway database

Clean seeded data, or a branch with migrations, beside the stack you already run. Variables in the environment win over `backend/.env`, so nothing in the checkout changes. Offset 40 and port 5440 are free: `pnpm a11y:run` takes 70 and 5470, and linked worktrees take the hundreds.

```sh
# The image `pnpm docker` built (`docker images | grep db`), with the `-c` flags of `db` in backend/compose.yaml
docker run -d --name scratch_db -e POSTGRES_PASSWORD=postgres -p 127.0.0.1:5440:5432 <image> -c wal_level=logical -c shared_preload_libraries=pg_cron -c cron.database_name=postgres

export DEV_PORT_OFFSET=40 ADMIN_EMAIL=admin-test@cellajs.com SYSTEM_ADMIN_IP_ALLOWLIST='*'
export DATABASE_URL=postgres://runtime_role:dev_password@0.0.0.0:5440/postgres
export DATABASE_ADMIN_URL=postgres://postgres:postgres@0.0.0.0:5440/postgres
export DATABASE_CDC_URL=postgres://admin_role:dev_password@0.0.0.0:5440/postgres

pnpm seed                                                                  # migrates, then seeds
(cd backend && NODE_ENV=development pnpm exec tsx src/main.ts) &            # the API, 40 ports up
(cd frontend && NODE_ENV=development pnpm exec vite --mode development) &   # the app, 40 ports up
```

- Every command runs with those exports: `pnpm seed` without them seeds the database you work in. An agent's shell keeps no exports between calls, so put them in a wrapper script that ends in `exec "$@"` and run each command through it.
- The API and Vite serve pages and writes. Nothing here starts the CDC worker or the relay, so pages get no live updates.
- Both Vite servers share `frontend/node_modules/.vite`: the second re-bundles the dependencies there, and the first re-bundles once more at its next start.
- Afterwards stop the two listeners (`lsof -tiTCP:<port> -sTCP:LISTEN`) and `docker rm -fv scratch_db`.

## Drive (browser)

- Playwright is a `frontend` devDependency, and Node resolves a bare `import 'playwright'` from the script file's own folder, so a scratch script elsewhere fails with `ERR_MODULE_NOT_FOUND`. Pipe it in from `frontend/`: `cd frontend && node --input-type=module < <script.mjs>`. The drivers under `cella/skills/` load it through `two-tab-sync-test/driver-lib.mjs`. Chromium cache: `~/Library/Caches/ms-playwright`.
- Signed-in pages: mint a session, with no UI login and no cookie built by hand (the app signs every cookie). `pnpm --filter backend session:mint <email>` ([backend scripts](../../../backend/scripts/README.md)) prints `<cookie name>=<signed value>` and a curl line with the API URL; the seeded admin is `ADMIN_EMAIL` in `backend/.env`, and acts as one only with `SYSTEM_ADMIN_IP_ALLOWLIST='*'` there: a `.env` copied from `.env.example` allows no address, so `/system` sends the admin to `/home`. Set the cookie with `context.addCookies([{ name, value, url: <appConfig.frontendUrl> }])`; the API is same-origin, under `<frontendUrl>/api`.
- When the script is done, sign the session out (`POST <api>/auth/sign-out` with the cookie and a JSON content type), or it stays listed as live in the user's sessions until it expires. In a driver: `mintSession` and `endSession` in `two-tab-sync-test/driver-lib.mjs`, or `startSession` and `endSession` in `a11y/src/session.ts`.
- A freshly seeded admin opens on the onboarding dialog: `PUT <api>/me` with `{ userFlags: { finishedOnboarding: true } }` skips it, as the drivers do.
- Boot smoke of a checkout or a new app: `node cella/skills/verify/smoke-driver.mjs` from the repo root starts `pnpm dev`, waits for a healthy stack with an active CDC replication, signs in as `ADMIN_EMAIL`, opens `/home` and an organization's attachments (seeded rows expected), then stops the stack. `START=` attaches to a stack that already runs; `OUT_DIR` holds the stack log, screenshots and `evidence.json`. The nightly `create-flow.yml` workflow in [create-cella](https://github.com/cellajs/create-cella/blob/main/.github/workflows/create-flow.yml) runs it on a new app: keep its interface stable.
- Realtime behavior across two tabs (entity sync, collaborative descriptions): the `two-tab-sync-test` skill and its driver.
- The on-screen keyboard, the visual viewport, editing text on a phone or real touch scrolling: the `android-emulator` skill. Desktop Chromium with a phone viewport shows none of these.
- Breakpoints come from `appConfig.theme.screenSizes`, not Tailwind's defaults: cella adds `xs` 420 and sets `2xl` to 1400. `useBreakpointBelow('sm')` is strict `< 640`.

## Gotchas

- `use-scroll-visibility.ts` ignores single-frame scroll jumps > 150px (`maxGestureDelta`) and has a 500ms initial cooldown, so `window.scrollBy(0, 1000)` will NOT hide floating nav buttons. Simulate gestures: repeated `page.mouse.wheel(0, ~100)` ticks at ~60ms intervals, after waiting ~1s post-load.
- Floating nav buttons: `#floating-nav` container, item ids like `marketing-menu` / `docs-menu`; hidden = `opacity-0` class on the button.
- Auth routes (check-email, magic links, SSO) run `isNoBot` (`backend/src/middlewares/is-no-bot.ts`), which answers 400 `maybe_bot` to headless Chromium's `HeadlessChrome` user agent. A script that walks the auth flow sets `userAgent` on its context to the same string without `Headless`.
- The dev-mode "Testing credentials" banner, fixed to the bottom of public pages, can overlap bottom-anchored UI in screenshots.
