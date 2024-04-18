ALTER TABLE "memberships" DROP CONSTRAINT "memberships_organization_id_user_id_pk";--> statement-breakpoint
ALTER TABLE "memberships" ALTER COLUMN "organization_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "id" varchar;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "type" varchar DEFAULT 'ORGANIZATION' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "organization_id" varchar NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
