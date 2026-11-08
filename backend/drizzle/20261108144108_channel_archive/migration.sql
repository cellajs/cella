ALTER TABLE "memberships" DROP CONSTRAINT "memberships_created_by_users_id_fkey";--> statement-breakpoint
ALTER TABLE "memberships" DROP CONSTRAINT "memberships_updated_by_users_id_fkey";--> statement-breakpoint
ALTER TABLE "memberships" RENAME COLUMN "archived" TO "hidden";--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "archived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_created_by_actors_id_fkey" FOREIGN KEY ("created_by") REFERENCES "actors"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_updated_by_actors_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "actors"("id") ON DELETE SET NULL;