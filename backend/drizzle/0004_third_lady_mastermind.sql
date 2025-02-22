ALTER TABLE "sessions" DROP CONSTRAINT "sessions_admin_user_id_users_id_fk";
--> statement-breakpoint
DROP INDEX "idx_admin_id";--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN "admin_user_id";