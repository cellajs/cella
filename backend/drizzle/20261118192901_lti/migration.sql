CREATE TABLE "lti_contexts" (
	"id" uuid PRIMARY KEY,
	"tenant_id" varchar(24) NOT NULL,
	"organization_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"context_id" varchar(255) NOT NULL,
	"label" varchar(255),
	"title" varchar(255),
	"types" varchar(255)[] DEFAULT '{}'::varchar(255)[] NOT NULL,
	"channel_type" varchar NOT NULL,
	"channel_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone,
	"updated_by" uuid
);
--> statement-breakpoint
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
ALTER TABLE "tokens" ADD COLUMN "tenant_id" varchar(24);--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "lti_resource_link_id" uuid;--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "issuer" varchar(255);--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "client_id" varchar(255);--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD COLUMN "tenant_id" varchar(24);--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD COLUMN "jwks_uri" varchar(2048);--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD COLUMN "initiate_login_uri" varchar(2048);--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD COLUMN "lti_tool_config" jsonb;--> statement-breakpoint
ALTER TABLE "tokens" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "connections" ALTER COLUMN "federation" DROP NOT NULL;--> statement-breakpoint
DROP INDEX "connections_tenant_id_kind_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "connections_tenant_id_kind_idx" ON "connections" ("tenant_id","kind") WHERE "kind" = 'sso';--> statement-breakpoint
CREATE UNIQUE INDEX "lti_contexts_connection_id_context_id_idx" ON "lti_contexts" ("connection_id","context_id");--> statement-breakpoint
CREATE INDEX "lti_contexts_channel_id_idx" ON "lti_contexts" ("channel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "connections_issuer_client_id_idx" ON "connections" ("issuer","client_id");--> statement-breakpoint
CREATE INDEX "lti_resource_links_channel_id_idx" ON "lti_resource_links" ("channel_id");--> statement-breakpoint
CREATE INDEX "lti_resource_links_installation_id_idx" ON "lti_resource_links" ("installation_id");--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_tenant_id_tenants_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_lti_resource_link_id_lti_resource_links_id_fkey" FOREIGN KEY ("lti_resource_link_id") REFERENCES "lti_resource_links"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "lti_contexts" ADD CONSTRAINT "lti_contexts_tenant_id_tenants_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id");--> statement-breakpoint
ALTER TABLE "lti_contexts" ADD CONSTRAINT "lti_contexts_connection_id_connections_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "connections"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "lti_contexts" ADD CONSTRAINT "lti_contexts_created_by_actors_id_fkey" FOREIGN KEY ("created_by") REFERENCES "actors"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "lti_contexts" ADD CONSTRAINT "lti_contexts_updated_by_actors_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "actors"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "lti_contexts" ADD CONSTRAINT "lti_contexts_GWuG77TCefJB_fkey" FOREIGN KEY ("tenant_id","organization_id") REFERENCES "organizations"("tenant_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "lti_installations" ADD CONSTRAINT "lti_installations_service_account_id_service_accounts_id_fkey" FOREIGN KEY ("service_account_id") REFERENCES "service_accounts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "lti_installations" ADD CONSTRAINT "lti_installations_approved_by_actors_id_fkey" FOREIGN KEY ("approved_by") REFERENCES "actors"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "lti_installations" ADD CONSTRAINT "lti_installations_created_by_actors_id_fkey" FOREIGN KEY ("created_by") REFERENCES "actors"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "lti_installations" ADD CONSTRAINT "lti_installations_updated_by_actors_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "actors"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "lti_resource_links" ADD CONSTRAINT "lti_resource_links_tenant_id_tenants_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id");--> statement-breakpoint
ALTER TABLE "lti_resource_links" ADD CONSTRAINT "lti_resource_links_installation_id_service_accounts_id_fkey" FOREIGN KEY ("installation_id") REFERENCES "service_accounts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "lti_resource_links" ADD CONSTRAINT "lti_resource_links_created_by_actors_id_fkey" FOREIGN KEY ("created_by") REFERENCES "actors"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "lti_resource_links" ADD CONSTRAINT "lti_resource_links_updated_by_actors_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "actors"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "lti_resource_links" ADD CONSTRAINT "lti_resource_links_jzaKxRic30uH_fkey" FOREIGN KEY ("tenant_id","organization_id") REFERENCES "organizations"("tenant_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD CONSTRAINT "oauth_clients_tenant_id_tenants_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_subject_check" CHECK (("email" IS NULL) <> ("tenant_id" IS NULL));--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_kind_check" CHECK (("kind" = 'sso' AND "federation" IS NOT NULL) OR ("kind" = 'lti' AND "issuer" IS NOT NULL AND "client_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD CONSTRAINT "oauth_clients_lti_check" CHECK (("lti_tool_config" IS NULL) = ("initiate_login_uri" IS NULL) AND ("lti_tool_config" IS NULL OR "jwks_uri" IS NOT NULL));