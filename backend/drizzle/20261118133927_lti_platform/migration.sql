CREATE TABLE "lti_installations" (
	"service_account_id" uuid PRIMARY KEY,
	"released_fields" jsonb DEFAULT '[]' NOT NULL,
	"approved_at" timestamp with time zone,
	"approved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD COLUMN "tenant_id" varchar(24);--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD COLUMN "jwks_uri" varchar(2048);--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD COLUMN "initiate_login_uri" varchar(2048);--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD COLUMN "target_link_uri" varchar(2048);--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD COLUMN "lti_tool_config" jsonb;--> statement-breakpoint
ALTER TABLE "lti_installations" ADD CONSTRAINT "lti_installations_service_account_id_service_accounts_id_fkey" FOREIGN KEY ("service_account_id") REFERENCES "service_accounts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "lti_installations" ADD CONSTRAINT "lti_installations_approved_by_actors_id_fkey" FOREIGN KEY ("approved_by") REFERENCES "actors"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "lti_installations" ADD CONSTRAINT "lti_installations_created_by_actors_id_fkey" FOREIGN KEY ("created_by") REFERENCES "actors"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "lti_installations" ADD CONSTRAINT "lti_installations_updated_by_actors_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "actors"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD CONSTRAINT "oauth_clients_tenant_id_tenants_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD CONSTRAINT "oauth_clients_lti_check" CHECK (("lti_tool_config" IS NULL) = ("initiate_login_uri" IS NULL) AND ("lti_tool_config" IS NULL) = ("target_link_uri" IS NULL) AND ("lti_tool_config" IS NULL OR "jwks_uri" IS NOT NULL));