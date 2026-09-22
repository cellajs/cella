CREATE TABLE "principals" (
	"id" uuid PRIMARY KEY,
	"kind" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Hand-added: every existing user becomes a principal of kind 'user' before the foreign keys below are created.
INSERT INTO "principals" ("id", "kind", "created_at") SELECT "id", 'user', "created_at" FROM "users";--> statement-breakpoint
ALTER TABLE "attachments" DROP CONSTRAINT "attachments_created_by_users_id_fkey";--> statement-breakpoint
ALTER TABLE "attachments" DROP CONSTRAINT "attachments_updated_by_users_id_fkey";--> statement-breakpoint
ALTER TABLE "attachments" DROP CONSTRAINT "attachments_deleted_by_users_id_fkey";--> statement-breakpoint
ALTER TABLE "organizations" DROP CONSTRAINT "organizations_created_by_users_id_fkey";--> statement-breakpoint
ALTER TABLE "organizations" DROP CONSTRAINT "organizations_updated_by_users_id_fkey";--> statement-breakpoint
ALTER TABLE "memberships" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_created_by_principals_id_fkey" FOREIGN KEY ("created_by") REFERENCES "principals"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_updated_by_principals_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "principals"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_deleted_by_principals_id_fkey" FOREIGN KEY ("deleted_by") REFERENCES "principals"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_created_by_principals_id_fkey" FOREIGN KEY ("created_by") REFERENCES "principals"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_updated_by_principals_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "principals"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_id_principals_id_fkey" FOREIGN KEY ("id") REFERENCES "principals"("id") ON DELETE CASCADE;