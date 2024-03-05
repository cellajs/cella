ALTER TABLE "users" ALTER COLUMN "language" SET DEFAULT 'en';--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "clear_sessions_at";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "last_email_at";