ALTER TABLE "projects" ADD COLUMN "parent_id" varchar;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "projects" ADD CONSTRAINT "projects_parent_id_workspaces_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
