CREATE TABLE "lti_resource_links" (
	"id" uuid PRIMARY KEY,
	"tenant_id" varchar(24) NOT NULL,
	"organization_id" uuid NOT NULL,
	"channel_type" varchar NOT NULL,
	"channel_id" uuid NOT NULL,
	"installation_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"custom" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "lti_resource_link_id" uuid;--> statement-breakpoint
CREATE INDEX "lti_resource_links_channel_id_idx" ON "lti_resource_links" ("channel_id");--> statement-breakpoint
CREATE INDEX "lti_resource_links_installation_id_idx" ON "lti_resource_links" ("installation_id");--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_lti_resource_link_id_lti_resource_links_id_fkey" FOREIGN KEY ("lti_resource_link_id") REFERENCES "lti_resource_links"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "lti_resource_links" ADD CONSTRAINT "lti_resource_links_tenant_id_tenants_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id");--> statement-breakpoint
ALTER TABLE "lti_resource_links" ADD CONSTRAINT "lti_resource_links_installation_id_service_accounts_id_fkey" FOREIGN KEY ("installation_id") REFERENCES "service_accounts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "lti_resource_links" ADD CONSTRAINT "lti_resource_links_created_by_actors_id_fkey" FOREIGN KEY ("created_by") REFERENCES "actors"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "lti_resource_links" ADD CONSTRAINT "lti_resource_links_updated_by_actors_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "actors"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "lti_resource_links" ADD CONSTRAINT "lti_resource_links_jzaKxRic30uH_fkey" FOREIGN KEY ("tenant_id","organization_id") REFERENCES "organizations"("tenant_id","id") ON DELETE CASCADE;