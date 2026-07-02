# Cella Copilot instructions

## Template vs fork
Cella is a TypeScript monorepo template for building collaborative web apps with sync & offline capabilities. It is designed to be forked and extended, with a dynamic, per-app configurable entity model (`user` and `organization` are built-in). If package.json has `cella` as its name, it is the template. Otherwise it is a 'fork'.

The canonical agent guidelines live in [info/AGENTS.md](../info/AGENTS.md) — read it for architecture, routing, guards, permissions, state/query patterns, sync engine, coding style, testing, deploy debugging, and commands. This file is intentionally thin so it stays in sync.

## Start here
- **Agent guidelines**: [info/AGENTS.md](../info/AGENTS.md)
- **Architecture & tech stack**: [info/ARCHITECTURE.md](../info/ARCHITECTURE.md)
- **Testing**: [info/TESTING.md](../info/TESTING.md)

## Quick reference
- **Monorepo** (pnpm workspaces): `backend/` (Hono, Drizzle, PostgreSQL), `frontend/` (React SPA, TanStack Router/Query, Zustand), `shared/` (config), `locales/` (i18n), `cdc/` (Change Data Capture worker). Both backend and frontend use a modular structure in `src/modules/` — keep new features in their own module.
- **Backend routes/handlers**: OpenAPI-first with `@hono/zod-openapi`. Routes in `backend/src/modules/<module>/<module>-routes.ts` via `createXRoute`; handlers in `<module>-handlers.ts` via `.openapi()`. Use `import { z } from '@hono/zod-openapi'` in backend (not plain zod).
- **Frontend SDK**: Generated in `sdk/gen/`, consumed via the `sdk` package — never edit manually. Run `pnpm sdk` after backend route/schema changes.
- **Routing**: File-based routes in `frontend/src/routes/` auto-registered into `routeTree.gen.ts` (committed, never hand-edited). Route files are thin shims; logic/components live in modules, wired via `getRouteApi('<route id>')`.
- **State**: Server state → TanStack Query (`frontend/src/modules/<module>/query.ts`); client state → Zustand (`frontend/src/store/`).
- **Entities**: `ContextEntityType` (has memberships, e.g. `organization`) and `ProductEntityType` (content, e.g. `attachment`). See `frontend/src/modules/attachments/` for reference.

## Code style
- Formatter/Linter: Biome (`pnpm lint:fix`). 2 spaces, single quotes, trailing commas (ES5), line width 100.
- kebab-case files, camelCase variables/functions (incl. constants), PascalCase components, snake_case translation keys.
- Sentence-case headers. Avoid `useMemo`/`useCallback` (React Compiler). Avoid barrel files except utils.
- Prefer reading actual code over README files, which often go stale.

## Essential commands
- `pnpm dev` — full dev (PostgreSQL + CDC Worker, requires Docker); `pnpm dev:core` — PostgreSQL only.
- `pnpm check` — sdk + typecheck + lint:fix.
- `pnpm generate` — Drizzle migrations from schema changes.
- `pnpm sdk` — regenerate OpenAPI spec + frontend SDK.
- `pnpm seed` — seed test data.
- `pnpm test` — full Vitest suite (`pnpm test:core` for narrower core mode).
- `pnpm cella` — sync changes from upstream cella to fork.

## Git safety
Use `git` and `gh` CLI; do not use GitKraken or other third-party git tools. **Never** run destructive worktree ops (`git stash`, `git reset --hard`, `git checkout -- <file>`, `git clean -fd`) — the worktree may be shared with other sessions or the user. Read-only `git status`/`git diff` are fine.
