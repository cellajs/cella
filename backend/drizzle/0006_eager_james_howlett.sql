ALTER TABLE "memberships" ALTER COLUMN "role" SET DEFAULT 'member';--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "entity" SET DEFAULT 'organization';--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "entity" SET DEFAULT 'project';--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "entity" SET DEFAULT 'user';--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'user';--> statement-breakpoint
ALTER TABLE "workspaces" ALTER COLUMN "entity" SET DEFAULT 'workspace';