DROP INDEX "tenants_subscription_status_index";--> statement-breakpoint
ALTER TABLE "tenants" DROP COLUMN "subscription_id";--> statement-breakpoint
ALTER TABLE "tenants" DROP COLUMN "subscription_status";--> statement-breakpoint
ALTER TABLE "tenants" DROP COLUMN "subscription_plan";