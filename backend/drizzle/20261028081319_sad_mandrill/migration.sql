DROP INDEX "seen_by_user_channel_type_index";--> statement-breakpoint
DROP INDEX "seen_by_product_id_index";--> statement-breakpoint
DROP INDEX "seen_by_tenant_id_index";--> statement-breakpoint
ALTER TABLE "seen_by" DROP COLUMN "channel_id";--> statement-breakpoint
ALTER TABLE "seen_by" DROP COLUMN "organization_id";--> statement-breakpoint
ALTER TABLE "seen_by" DROP COLUMN "tenant_id";--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "languages" SET DATA TYPE jsonb USING "languages"::jsonb;--> statement-breakpoint
ALTER TABLE "tenants" ALTER COLUMN "restrictions" SET DATA TYPE jsonb USING "restrictions"::jsonb;--> statement-breakpoint
ALTER TABLE "tenants" ALTER COLUMN "auth_strategies" SET DATA TYPE jsonb USING "auth_strategies"::jsonb;