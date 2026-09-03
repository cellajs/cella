---
name: verify
description: Build, launch, and drive the cella frontend to verify UI changes at runtime.
---

# Verifying cella frontend changes

## Launch

- Dev server: `cd frontend && pnpm dev` → http://localhost:3000 (plain HTTP). Marketing pages (`/about`, `/features`, `/sync-engine`, `/docs`) render without the backend; the "Offline · Connection lost" toast without a backend is expected, not a regression.
- Port 3000 is cella's; 3020/4020 etc. belong to other checkouts (projectcampus). Check `lsof -iTCP:3000 -sTCP:LISTEN` before starting.
- Typecheck: `cd frontend && pnpm ts` (tsgo). Lint: `pnpm exec biome check <file>` from repo root.

## Drive (browser)

- Playwright is in the root pnpm store; bare `require('playwright')` fails outside the workspace. Import directly:
  `await import('<repo-root>/node_modules/.pnpm/playwright@<version>/node_modules/playwright/index.mjs')` (glob `node_modules/.pnpm/playwright@*` for the version). Chromium cache: `~/Library/Caches/ms-playwright`.
- Breakpoints come from `appConfig.theme.screenSizes` (Tailwind defaults: sm 640, md 768). `useBreakpointBelow('sm')` is strict `< 640`.

## Gotchas

- `use-scroll-visibility.ts` ignores single-frame scroll jumps > 150px (`MAX_GESTURE_DELTA`) and has a 500ms initial cooldown, so `window.scrollBy(0, 1000)` will NOT hide floating nav buttons. Simulate gestures: repeated `page.mouse.wheel(0, ~100)` ticks at ~60ms intervals, after waiting ~1s post-load.
- Floating nav buttons: `#floating-nav` container, item ids like `marketing-menu` / `docs-menu`; hidden = `opacity-0` class on the button.
- The dev-mode "Testing credentials" toast at the bottom of marketing pages can overlap bottom-anchored UI in screenshots.
