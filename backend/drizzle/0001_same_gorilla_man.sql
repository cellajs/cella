ALTER TABLE "tokens" DROP CONSTRAINT "tokens_organization_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "tokens" DROP COLUMN "entity_type";--> statement-breakpoint
ALTER TABLE "tokens" DROP COLUMN "role";--> statement-breakpoint
ALTER TABLE "tokens" DROP COLUMN "organization_id";