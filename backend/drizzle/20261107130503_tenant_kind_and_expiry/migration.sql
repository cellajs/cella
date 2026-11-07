ALTER TABLE "tenants" ADD COLUMN "kind" varchar DEFAULT 'live' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "tenants_kind_index" ON "tenants" ("kind");--> statement-breakpoint
CREATE INDEX "tenants_expires_at_index" ON "tenants" ("expires_at");--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_demo_expires_check" CHECK ("kind" <> 'demo' OR "expires_at" IS NOT NULL);