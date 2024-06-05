ALTER TABLE "projects" DROP CONSTRAINT "projects_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN IF EXISTS "workspace_id";