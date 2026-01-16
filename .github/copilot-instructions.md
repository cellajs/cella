# Cella Copilot Instructions

Cella is a TypeScript monorepo template for building collaborative web apps with sync & offline capabilities.

## Architecture Overview

**Flat-root monorepo** with pnpm workspaces:
- `backend/` - Hono API server, Drizzle ORM, PostgreSQL
- `frontend/` - React SPA, TanStack Router/Query, Zustand
- `config/` - Shared environment configs (development, production, staging)
- `locales/` - i18n translations (en, nl)

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
- `ProductEntityType` - Content entities with sync/offline support (e.g., `attachment`, `page`)

Product entities are typically daily-use content data models that can benefit from Electric Sync + TanStack DB for realtime updates. See `frontend/src/modules/attachments/` for reference implementation.

## Essential Commands

```bash
pnpm quick          # Fast dev with PGlite (DEV_MODE=basic, no Docker)
pnpm dev            # Full dev with PostgreSQL (DEV_MODE=core, requires Docker)
pnpm check          # Run generate:openapi + typecheck + lint:fix
pnpm generate       # Create Drizzle migrations from schema changes
pnpm seed           # Seed database with test data
pnpm test           # Run all Vitest tests
```

## Code Style

- **Formatter/Linter**: Biome (`pnpm lint:fix`)
- **Indentation**: 2 spaces, single quotes, trailing commas (ES5)
- **Files**: kebab-case (`user-profile.tsx`)
- **Variables/functions**: camelCase
- **Components**: PascalCase
- **Translation keys**: snake_case
- **React Compiler**: Avoid `useMemo`/`useCallback` in most cases
- **Import/export** Avoid barrel files unless for utils folders. Dont re-export except for proper barrel files.

## File Locations

| Purpose | Location |
|---------|----------|
| DB schemas | `backend/src/db/schema/` |
| API validation | `backend/src/modules/<module>/schema.ts` |
| Generated types | `frontend/src/api.gen/` |
| Query keys/options | `frontend/src/modules/<module>/query.ts` |
| Route definitions | `frontend/src/routes/` + `route-tree.tsx` |
| UI components | `frontend/src/modules/ui/` (Shadcn) |
| Common components | `frontend/src/modules/common/` |

## Conventions
- Test files: `*.test.ts` adjacent to source or in `tests/`
- Commit format: Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`)
- PRs: Include description, linked issues, screenshots for UI changes

For detailed architecture, see [info/ARCHITECTURE.md](../info/ARCHITECTURE.md)
For more rules and guidelinse, see [info/AGENTS.md](../info/AGENTS.md).
