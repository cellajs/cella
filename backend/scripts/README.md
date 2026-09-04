# Backend Scripts

Development and build scripts for the backend.

## Root Scripts

- **generate.ts** - Runs `drizzle-kit generate` (schema diff), then collects raw-SQL side-effects (RLS, CDC, triggers) into one combined migration
- **generate-openapi.ts** - Writes the OpenAPI spec to `openapi.cache.json`
- **seed.ts** - Runs migrations, then the seed scripts from config
- **manual-migration.ts** - CLI to add custom SQL migrations (triggers, functions) to Drizzle
- **upload-seed-assets.ts** (`pnpm seed:assets`) - Publishes `seeds/assets/` to the public bucket under an immutable version prefix and writes `seeds/seed-assets.json`, the manifest the attachment seed reads. Needs `S3_ACCESS_KEY_ID`; `--check` verifies the published set anonymously and needs nothing
- **set-bucket-cors.ts** (`pnpm s3:cors [origins]`) - Sets browser CORS on the shared development buckets for the frontend origin, or a comma-separated list

## Folders

- **migrations/** - Migration generator scripts (CDC setup, activity triggers)
- **seeds/** - Seed data by entity: user, organizations, `data` for product entities
- **seeds/assets/** - Source files of the seeded attachments, one folder per file with `original` plus optional `thumbnail`, `preview` and `converted` variants; a changed set gets a new version prefix in `seeds/seed-assets.ts`
- **drizzle-studio/** - Start/stop Drizzle Studio on a specific port
