---
name: verify
description: Build, launch, and drive the cella frontend to verify UI changes at runtime.
---

# Verifying cella frontend changes

## Launch

- Dev server: `cd frontend && pnpm dev` (plain HTTP). The main checkout serves http://localhost:3000. A linked git worktree gets ports of its own (3100 and 4100-4106, then 3200, ...): Vite prints the URL, and `appConfig.frontendUrl` holds it. Marketing pages (`/about`, `/features`, `/sync-engine`, `/docs`) render without the backend; the "Offline · Connection lost" toast without a backend is expected, not a regression.
- Never pass `--port`, and never start a server on the main checkout's ports from a worktree: the app URLs are built from the config, so a server on another port fails with "Failed to fetch". 3020/4020 etc. belong to other apps (projectcampus).
- The worktree's Vite proxies `/api` to the worktree's own backend port, so pages that need data need that backend running. It migrates the database named in `backend/.env` on boot, and that is the main checkout's database unless the worktree has its own: give a branch with migrations its own database first, and never run a second CDC worker on a shared one.
- `pnpm stop` ends this checkout's Vite only.
- Typecheck: `cd frontend && pnpm ts` (tsgo). Lint: `pnpm exec biome check <file>` from repo root.

## Drive (browser)

- Playwright is in the root pnpm store; bare `require('playwright')` fails outside the workspace. Import directly:
  `await import('<repo-root>/node_modules/.pnpm/playwright@<version>/node_modules/playwright/index.mjs')` (glob `node_modules/.pnpm/playwright@*` for the version). Chromium cache: `~/Library/Caches/ms-playwright`.
- Signed-in pages: no UI login, and no cookie built by hand (the app signs every cookie). `pnpm --filter backend session:mint <email> [hours]` (development and test mode only) prints `<cookie name>=<signed value>` and a curl line with the API URL; the seeded admin is `ADMIN_EMAIL` in `backend/.env`. Set it with `context.addCookies([{ name, value, url: <appConfig.frontendUrl> }])`. The API is same-origin, under `<frontendUrl>/api`. Worked example: `startSession` in `a11y/src/session.ts`.
- Boot smoke of a checkout or a new app: `node cella/skills/verify/smoke-driver.mjs` from the repo root starts `pnpm dev`, waits for the frontend and `/health`, requires `CDC WebSocket connected` in its log, signs in as `ADMIN_EMAIL` and opens `/home` and an organization's attachments (seeded rows expected), then stops the stack. `START=` attaches to a stack that already runs; `OUT_DIR` holds the stack log, screenshots and `evidence.json`. The nightly `create-flow.yml` workflow runs it on an app made with `pnpm create @cellajs/cella`.
- Realtime behavior across two tabs (entity sync, collaborative descriptions): the `two-tab-sync-test` skill and its driver.
- Breakpoints come from `appConfig.theme.screenSizes` (Tailwind defaults: sm 640, md 768). `useBreakpointBelow('sm')` is strict `< 640`.

## Gotchas

- `use-scroll-visibility.ts` ignores single-frame scroll jumps > 150px (`MAX_GESTURE_DELTA`) and has a 500ms initial cooldown, so `window.scrollBy(0, 1000)` will NOT hide floating nav buttons. Simulate gestures: repeated `page.mouse.wheel(0, ~100)` ticks at ~60ms intervals, after waiting ~1s post-load.
- Floating nav buttons: `#floating-nav` container, item ids like `marketing-menu` / `docs-menu`; hidden = `opacity-0` class on the button.
- The dev-mode "Testing credentials" banner, fixed to the bottom of public pages, can overlap bottom-anchored UI in screenshots.
