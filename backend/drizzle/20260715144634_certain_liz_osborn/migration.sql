DROP INDEX "organizations_tenant_id_index";--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "device_id_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "auth_strategies" json DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" DROP COLUMN "auth_strategies";--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_tenant_id_key" UNIQUE("tenant_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_device_id_hash_idx" ON "sessions" ("user_id","device_id_hash");