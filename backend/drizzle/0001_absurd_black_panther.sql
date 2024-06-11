ALTER TABLE "organizations" RENAME COLUMN "brand_color" TO "color";--> statement-breakpoint
ALTER TABLE "requests" DROP CONSTRAINT "requests_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "requests" DROP CONSTRAINT "requests_organization_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "requests" DROP COLUMN IF EXISTS "user_id";--> statement-breakpoint
ALTER TABLE "requests" DROP COLUMN IF EXISTS "organization_id";