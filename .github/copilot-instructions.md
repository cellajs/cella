# Cella Copilot instructions

## Template vs app

Cella is a TypeScript monorepo template for collaborative web apps with sync & offline support, built to be customized, with a per-app configurable entity model (`user` and `organization` are built-in). If package.json is named `cella`, it is the template; otherwise it is an 'app'.

The canonical agent guidelines live in [cella/AGENTS.md](../cella/AGENTS.md): architecture, routing, guards, permissions, state/query patterns, sync engine, coding style, testing, deploy debugging, and commands. This file stays thin on purpose.

## Start here

- **Agent guidelines**: [cella/AGENTS.md](../cella/AGENTS.md)
- **Architecture & tech stack**: [cella/ARCHITECTURE.md](../cella/ARCHITECTURE.md)
- **Testing**: [cella/TESTING.md](../cella/TESTING.md)

## Quick reference

- **Monorepo** (pnpm workspaces): `backend/` (Hono, Drizzle, PostgreSQL), `frontend/` (React SPA, TanStack Router/Query, Zustand), `shared/` (config), `locales/` (i18n), `cdc/` (Change Data Capture worker). Backend and frontend are modular under `src/modules/`; new features get their own module.
- **Backend routes/handlers**: OpenAPI-first with `@hono/zod-openapi`. Routes in `backend/src/modules/<module>/<module>-routes.ts` via `createXRoute`; handlers in `<module>-handlers.ts` via `.openapi()`. Backend imports `z` from `@hono/zod-openapi`, not plain zod.
- **Frontend SDK**: generated in `sdk/gen/`, consumed via the `sdk` package; never edit by hand. Run `pnpm sdk` after backend route/schema changes.
- **Routing**: file-based routes in `frontend/src/routes/` auto-registered into `routeTree.gen.ts` (committed, never hand-edited). Route files are thin shims; logic lives in modules, wired via `getRouteApi('<route id>')`.
- **State**: server state in TanStack Query (`frontend/src/modules/<module>/query.ts`); client state in Zustand `*-store.ts` files inside their module.
- **Entities**: `ChannelEntityType` (has memberships, e.g. `organization`) and `ProductEntityType` (content, e.g. `attachment`). Reference: `frontend/src/modules/attachment/`.

## Code style

- Biome (`pnpm lint:fix`): 2 spaces, single quotes, trailing commas (ES5), line width 100.
- kebab-case files, camelCase variables/functions (incl. constants), PascalCase components, snake_case translation keys.
- Sentence-case headers. No `useMemo`/`useCallback` (React Compiler). No barrel files except utils.
- Prefer reading code over READMEs, which go stale.

## Essential commands

- `pnpm dev`: full dev (PostgreSQL + CDC Worker, requires Docker); `pnpm dev:core`: PostgreSQL only.
- `pnpm check`: sdk + typecheck + lint:fix.
- `pnpm generate`: Drizzle migrations from schema changes.
- `pnpm sdk`: regenerate OpenAPI spec + frontend SDK.
- `pnpm seed`: seed test data.
- `pnpm test`: full Vitest suite (`pnpm test:storybook` for Storybook component tests).
- `pnpm cella`: sync changes from upstream cella to an app.

## Git safety

Use `git` and `gh` CLI, never GitKraken or other third-party git tools. **Never** run destructive worktree ops (`git stash`, `git reset --hard`, `git checkout -- <file>`, `git clean -fd`): the worktree may be shared with other sessions or the user. Read-only `git status`/`git diff` are fine.
