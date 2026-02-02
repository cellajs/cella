# Cella Copilot Instructions

Cella is a TypeScript monorepo template for building collaborative web apps with sync & offline capabilities.

## Important information
Cella is a minimal implementation of the template itself. It is designed to be forked and extended to build custom applications. The entity model is dynamic and configurable per app, with `user` and `organization` as built-in entities. The architecture focuses on a hybrid sync engine to enable offline-first experiences with real-time updates. Raak is an example app built with the Cella template, showcasing its capabilities. It should be used as a reference to build  implementations so please check it out in the raak folder if it is included in a VSCode workspace.

## Architecture Overview

**Flat-root monorepo** with pnpm workspaces:
- `backend/` - Hono API server, Drizzle ORM, PostgreSQL
- `frontend/` - React SPA, TanStack Router/Query, Zustand
- `config/` - Shared environment configs (development, production, staging)
- `locales/` - i18n translations (en, nl)
- `info/` - Documentation
- `cdc/` - CDC (Change Data Capture) worker (optional)

Both backend and frontend use **modular structure** in `src/modules/` (e.g., `auth`, `users`, `organizations`, `attachments`). Keep new features in their own modules.

## Key Patterns

### Backend Routes & Handlers
Routes are OpenAPI-first using `@hono/zod-openapi`:
```typescript
// backend/src/modules/<module>/routes.ts - Define OpenAPI spec
createXRoute({ operationId, method, path, guard, request, responses })

// backend/src/modules/<module>/handlers.ts - Implement handlers
app.openapi(routes.operationName, async (ctx) => { ... })
```
Use `import { z } from '@hono/zod-openapi'` in backend (NOT plain zod).

### Frontend API Client
Generated SDK in `frontend/src/api.gen/` - **never edit manually**. After backend route/schema changes:
```bash
pnpm generate:openapi
```

### Frontend Routing (Code-based, not file-based)
Routes in `frontend/src/routes/*.tsx` must be manually added to `frontend/src/routes/route-tree.tsx`. Use `createRoute` from TanStack Router.

### State Management
- **Server state**: TanStack Query with query options in `frontend/src/modules/<module>/query.ts`
- **Client state**: Zustand stores in `frontend/src/store/`

### Entity Types
A core concept of cella is the ability to dynamically manage different types of entities for each app built with the template. `user` is a special entity that exists across all apps. `organization` is a required entity. There are two main categories of entityType (singular):
- `ContextEntityType` - Has memberships (e.g., `organization`, but apps could add `project`)
- `ProductEntityType` - Content entities without membership (e.g., `attachment`, `page`)

Product entities are typically daily-use content data models that can optionally benefit from for realtime updates. See `frontend/src/modules/attachments/` for reference implementation.

## Essential Commands

```bash
pnpm quick          # Fast dev with PGlite (DEV_MODE=basic, no Docker)
pnpm dev            # Full dev with PostgreSQL + CDC Worker (DEV_MODE=full, requires Docker)
pnpm dev:core       # Dev with PostgreSQL only (DEV_MODE=core, no CDC)
pnpm check          # Run generate:openapi + typecheck + lint:fix
pnpm generate       # Create Drizzle migrations from schema changes
pnpm seed           # Seed database with test data
pnpm test           # Run all Vitest tests
pnpm cella           # Sync changes from upstream cella to fork (useful for forks)
```

## Code style and conventions

- **Formatter/Linter**: Biome (`pnpm lint:fix`)
- **Indentation**: 2 spaces, single quotes, trailing commas (ES5)
- **Files**: kebab-case (`user-profile.tsx`)
- **Variables/functions**: camelCase (including constants)
- **Components**: PascalCase
- **Translation keys**: snake_case
- **Headers**: Sentence case only (`## Code style`, not `## Code Style`)
- **React Compiler**: Avoid `useMemo`/`useCallback` in most cases
- **Import/export**: Avoid barrel files unless for utils folders. Don't re-export except for proper barrel files.
- **Test files**: `*.test.ts` adjacent to source or in `tests/`
- **Commit format**: Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`)
- **PRs**: Include description, linked issues, screenshots for UI changes

**Avoid relying on README files** - They often become stale. Prefer reading actual code and design decision documentation.

## File Locations

| Purpose | Location |
|---------|----------|
| DB schemas | `backend/src/db/schema/[tablename]` |
| API validation | `backend/src/modules/<module>/[module]-schema.ts` |
| Generated types | `frontend/src/api.gen/` |
| Query keys/options | `frontend/src/modules/<module>/query.ts` |
| Route definitions | `frontend/src/routes/` + `route-tree.tsx` |
| UI react components | `frontend/src/modules/ui/` (Shadcn) |
| Common react components | `frontend/src/modules/common/` |


For detailed architecture, see [info/ARCHITECTURE.md](../info/ARCHITECTURE.md)
For more rules and guidelinse, see [info/AGENTS.md](../info/AGENTS.md).
For writing tests and testing instructions, see [info/TESTING.md](../info/TESTING.md).
