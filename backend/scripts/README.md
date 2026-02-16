# Backend Scripts

Development and build scripts for the backend.

## Root Scripts

- **generate.ts** - Runs all generation scripts defined in `appConfig.generateScripts` (migrations, CDC setup, etc.)
- **generate-openapi.ts** - Generates OpenAPI documentation and saves it to `openapi.cache.json`
- **seed.ts** - Runs database migrations and executes seed scripts from config
- **quick.ts** - Quick start with PGlite: migrates and seeds the database in one step
- **manual-migration.ts** - CLI to add custom SQL migrations (triggers, functions) to Drizzle

## Folders

- **migrations/** - Migration generator scripts (CDC setup, activity triggers)
- **seeds/** - Seed data scripts organized by entity: user, organizations, `data` for product entities. 
- **drizzle-studio/** - Scripts to start/stop Drizzle Studio on a specific port
