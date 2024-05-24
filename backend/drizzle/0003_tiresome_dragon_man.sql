ALTER TABLE "organizations" ALTER COLUMN "entity" SET DEFAULT 'ORGANIZATION';--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "entity" SET DEFAULT 'PROJECT';--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "entity" SET DEFAULT 'USER';--> statement-breakpoint
ALTER TABLE "workspaces" ALTER COLUMN "entity" SET DEFAULT 'WORKSPACE';--> statement-breakpoint
ALTER TABLE "memberships" DROP COLUMN IF EXISTS "entity";--> statement-breakpoint
ALTER TABLE "oauth_accounts" DROP COLUMN IF EXISTS "entity";--> statement-breakpoint
ALTER TABLE "requests" DROP COLUMN IF EXISTS "entity";--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN IF EXISTS "entity";--> statement-breakpoint
ALTER TABLE "tokens" DROP COLUMN IF EXISTS "entity";