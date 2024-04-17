CREATE TABLE IF NOT EXISTS "workspaces" (
	"id" varchar PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"slug" varchar NOT NULL,
	"thumbnail_url" varchar,
	"banner_url" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" varchar,
	"modified_at" timestamp,
	"modified_by" varchar,
	CONSTRAINT "workspaces_name_unique" UNIQUE("name"),
	CONSTRAINT "workspaces_short_name_unique" UNIQUE("short_name"),
	CONSTRAINT "workspaces_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspace_name_index" ON "workspaces" ("name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspace_created_at_index" ON "workspaces" ("created_at");--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "workspace_id" varchar;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_modified_by_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "memberships" ADD CONSTRAINT "memberships_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
