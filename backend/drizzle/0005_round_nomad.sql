CREATE TABLE IF NOT EXISTS "projects_to_workspaces" (
	"project_id" varchar NOT NULL,
	"workspace_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "projects_to_workspaces_project_id_workspace_id_pk" PRIMARY KEY("project_id","workspace_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "projects_to_workspaces" ADD CONSTRAINT "projects_to_workspaces_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "projects_to_workspaces" ADD CONSTRAINT "projects_to_workspaces_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspace_id_index" ON "projects_to_workspaces" ("workspace_id");