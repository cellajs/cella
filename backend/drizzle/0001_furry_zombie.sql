ALTER TABLE "inactive_memberships" DROP CONSTRAINT "inactive_memberships_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "inactive_memberships" ALTER COLUMN "created_by" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ALTER COLUMN "created_by" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "inactive_memberships" ADD CONSTRAINT "inactive_memberships_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;