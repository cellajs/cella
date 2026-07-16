# Backend Scripts

Development and build scripts for the backend.

## Root Scripts

- **generate.ts** - Runs `drizzle-kit generate` (schema diff), then collects raw-SQL side-effects (RLS, CDC, triggers, etc.) into one combined migration
- **generate-openapi.ts** - Generates OpenAPI documentation and saves it to `openapi.cache.json`
- **seed.ts** - Runs database migrations and executes seed scripts from config
- **manual-migration.ts** - CLI to add custom SQL migrations (triggers, functions) to Drizzle

## Folders

- **migrations/** - Migration generator scripts (CDC setup, activity triggers)
- **seeds/** - Seed data scripts organized by entity: user, organizations, `data` for product entities. 
- **drizzle-studio/** - Scripts to start/stop Drizzle Studio on a specific port
