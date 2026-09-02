# Backend Scripts

Development and build scripts for the backend.

## Root Scripts

- **generate.ts** - Runs `drizzle-kit generate` (schema diff), then collects raw-SQL side-effects (RLS, CDC, triggers) into one combined migration
- **generate-openapi.ts** - Writes the OpenAPI spec to `openapi.cache.json`
- **seed.ts** - Runs migrations, then the seed scripts from config
- **manual-migration.ts** - CLI to add custom SQL migrations (triggers, functions) to Drizzle

## Folders

- **migrations/** - Migration generator scripts (CDC setup, activity triggers)
- **seeds/** - Seed data by entity: user, organizations, `data` for product entities
- **drizzle-studio/** - Start/stop Drizzle Studio on a specific port
