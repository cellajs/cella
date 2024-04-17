ALTER TABLE "workspaces" DROP CONSTRAINT "workspaces_name_unique";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "name" SET NOT NULL;