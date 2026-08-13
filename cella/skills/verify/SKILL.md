---
name: verify
description: Build, launch, and drive the cella frontend to verify UI changes at runtime.
---

# Verifying cella frontend changes

## Launch

- Frontend dev server: `cd frontend && pnpm dev` → http://localhost:3000 (plain HTTP in dev). Marketing pages (`/about`, `/features`, `/sync-engine`, `/docs`) render without the backend; an "Offline · Connection lost" toast appears when the backend is down — expected, not a regression.
- Port 3000 is cella's; other node servers on 3020/4020 etc. belong to other checkouts (projectcampus). Check `lsof -iTCP:3000 -sTCP:LISTEN` before starting.
- Typecheck: `cd frontend && pnpm ts` (tsgo). Lint: `pnpm exec biome check <file>` from repo root.

## Drive (browser)

- Playwright is in the root pnpm store, not resolvable by bare `require('playwright')` from outside the workspace. Import directly:
  `await import('<repo-root>/node_modules/.pnpm/playwright@<version>/node_modules/playwright/index.mjs')` (glob `node_modules/.pnpm/playwright@*` from the repo root for the version). Chromium is cached in `~/Library/Caches/ms-playwright`.
- Breakpoints come from `appConfig.theme.screenSizes` (Tailwind defaults: sm 640, md 768). `useBreakpointBelow('sm')` is strict `< 640`.

## Gotchas

- `use-scroll-visibility.ts` ignores single-frame scroll jumps > 150px (`MAX_GESTURE_DELTA`) and has a 500ms initial cooldown — `window.scrollBy(0, 1000)` will NOT hide floating nav buttons. Simulate gestures with repeated `page.mouse.wheel(0, ~100)` ticks with ~60ms waits, and wait ~1s after load before scrolling.
- Floating nav buttons: `#floating-nav` container, item ids like `marketing-menu` / `docs-menu`; hidden state is `opacity-0` class on the button.
- A dev-mode "Testing credentials" toast sits at the bottom of marketing pages and can overlap bottom-anchored UI in screenshots.
