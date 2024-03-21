ALTER TABLE "memberships" DROP CONSTRAINT "memberships_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "organizations" DROP CONSTRAINT "organizations_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "default_language" SET DEFAULT 'en';--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "default_language" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "languages" SET DEFAULT '["en"]'::json;--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "languages" SET NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "memberships" ADD CONSTRAINT "memberships_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "organizations" ADD CONSTRAINT "organizations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
