DROP INDEX IF EXISTS "idx_tasks_description";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "slug";