DROP INDEX "organizations_tenant_id_index";--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "auth_strategies" json DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" DROP COLUMN "auth_strategies";--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_tenant_id_key" UNIQUE("tenant_id");