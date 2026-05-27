CREATE TABLE "activities" (
	"id" varchar(50),
	"tenant_id" varchar(24),
	"user_id" uuid,
	"entity_type" varchar,
	"resource_type" varchar,
	"action" varchar NOT NULL,
	"table_name" varchar(255) NOT NULL,
	"type" varchar NOT NULL,
	"subject_id" varchar(50),
	"organization_id" uuid,
	"project_id" uuid,
	"created_at" timestamp DEFAULT now(),
	"changed_fields" jsonb,
	"stx" jsonb,
	CONSTRAINT "activities_pkey" PRIMARY KEY("id","created_at")
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY,
	"entity_type" varchar DEFAULT 'attachment' NOT NULL,
	"tenant_id" varchar(24) NOT NULL,
	"name" varchar(255) DEFAULT 'New attachment' NOT NULL,
	"updated_at" timestamp,
	"stx" jsonb NOT NULL,
	"description" varchar(1000000) DEFAULT '',
	"keywords" varchar(1000000) DEFAULT '' NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"seq" bigint DEFAULT 0 NOT NULL,
	"public" boolean DEFAULT false NOT NULL,
	"bucket_name" varchar(255) NOT NULL,
	"group_id" uuid,
	"filename" varchar(255) NOT NULL,
	"content_type" varchar(255) NOT NULL,
	"converted_content_type" varchar(255),
	"size" varchar(255) NOT NULL,
	"original_key" varchar(2048) NOT NULL,
	"converted_key" varchar(2048),
	"thumbnail_key" varchar(2048),
	"organization_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "context_counters" (
	"context_key" varchar(50) PRIMARY KEY,
	"counts" jsonb DEFAULT '{}' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domains" (
	"id" uuid PRIMARY KEY,
	"tenant_id" varchar(24) NOT NULL,
	"domain" varchar(255) NOT NULL UNIQUE,
	"verified" boolean DEFAULT false NOT NULL,
	"verification_token" varchar(50),
	"verified_at" timestamp,
	"last_checked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "emails" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY,
	"email" varchar(255) NOT NULL UNIQUE,
	"verified" boolean DEFAULT false NOT NULL,
	"token_id" uuid,
	"user_id" uuid NOT NULL,
	"verified_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "inactive_memberships" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY,
	"tenant_id" varchar(24) NOT NULL,
	"context_type" varchar NOT NULL,
	"context_id" uuid NOT NULL,
	"email" varchar(255) NOT NULL,
	"user_id" uuid,
	"token_id" uuid,
	"role" varchar DEFAULT 'member' NOT NULL,
	"rejected_at" timestamp,
	"created_by" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	CONSTRAINT "inactive_memberships_tenant_email_ctx" UNIQUE("tenant_id","email","context_id")
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY,
	"tenant_id" varchar(24) NOT NULL,
	"context_type" varchar NOT NULL,
	"context_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" varchar DEFAULT 'member' NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp,
	"updated_by" uuid,
	"archived" boolean DEFAULT false NOT NULL,
	"muted" boolean DEFAULT false NOT NULL,
	"display_order" double precision NOT NULL,
	"organization_id" uuid NOT NULL,
	CONSTRAINT "memberships_unique_context" UNIQUE("tenant_id","user_id","context_id")
);
--> statement-breakpoint
CREATE TABLE "oauth_accounts" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY,
	"provider" varchar NOT NULL,
	"provider_user_id" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp,
	"user_id" uuid NOT NULL,
	CONSTRAINT "oauth_accounts_provider_provider_user_id_email_unique" UNIQUE("provider","provider_user_id","email")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY,
	"entity_type" varchar DEFAULT 'organization' NOT NULL,
	"tenant_id" varchar(24) NOT NULL,
	"name" varchar(255) NOT NULL,
	"updated_at" timestamp,
	"slug" varchar(255) NOT NULL UNIQUE,
	"thumbnail_url" varchar(2048),
	"banner_url" varchar(2048),
	"created_by" uuid,
	"updated_by" uuid,
	"short_name" varchar(255),
	"country" varchar(255),
	"timezone" varchar(255),
	"default_language" varchar DEFAULT 'en' NOT NULL,
	"languages" json DEFAULT '["en"]' NOT NULL,
	"notification_email" varchar(255),
	"color" varchar(255),
	"logo_url" varchar(2048),
	"website_url" varchar(2048),
	"welcome_text" varchar(1000000),
	"auth_strategies" json DEFAULT '[]' NOT NULL,
	"chat_support" boolean DEFAULT false NOT NULL,
	CONSTRAINT "organizations_tenant_id_unique" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY,
	"entity_type" varchar DEFAULT 'page' NOT NULL,
	"name" varchar(255) DEFAULT 'New page' NOT NULL,
	"updated_at" timestamp,
	"stx" jsonb NOT NULL,
	"description" varchar(1000000) DEFAULT '',
	"keywords" varchar(1000000) DEFAULT '' NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"seq" bigint DEFAULT 0 NOT NULL,
	"status" varchar DEFAULT 'unpublished' NOT NULL,
	"render_mode" varchar DEFAULT 'default' NOT NULL,
	"public_at" timestamp,
	"parent_id" uuid,
	"display_order" double precision NOT NULL,
	CONSTRAINT "pages_group_order" UNIQUE("parent_id","display_order")
);
--> statement-breakpoint
CREATE TABLE "passkeys" (
	"id" uuid PRIMARY KEY,
	"user_id" uuid NOT NULL,
	"credential_id" varchar(2048) NOT NULL,
	"public_key" varchar(2048) NOT NULL,
	"device_name" varchar(255),
	"device_type" varchar DEFAULT 'desktop' NOT NULL,
	"device_os" varchar(255),
	"browser" varchar(255),
	"name_on_device" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_counters" (
	"entity_id" uuid PRIMARY KEY,
	"entity_type" varchar NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"last_viewed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY,
	"points" integer NOT NULL,
	"expire" timestamp
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY,
	"message" varchar(255),
	"email" varchar(255) NOT NULL,
	"type" varchar NOT NULL,
	"token_id" uuid
);
--> statement-breakpoint
CREATE TABLE "seen_by" (
	"id" uuid,
	"user_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"entity_type" varchar NOT NULL,
	"context_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"tenant_id" varchar(24) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "seen_by_pkey" PRIMARY KEY("id","created_at"),
	CONSTRAINT "seen_by_user_entity_unique" UNIQUE("user_id","entity_id")
);
--> statement-breakpoint
CREATE TABLE "seen_counts" (
	"entity_id" uuid PRIMARY KEY,
	"entity_type" varchar NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid,
	"secret" varchar(255) NOT NULL,
	"type" varchar DEFAULT 'regular' NOT NULL,
	"user_id" uuid NOT NULL,
	"device_name" varchar(255),
	"device_type" varchar DEFAULT 'desktop' NOT NULL,
	"device_os" varchar(255),
	"browser" varchar(255),
	"auth_strategy" varchar NOT NULL,
	"ip_hash" varchar(64),
	"ip_subnet_hash" varchar(64),
	"ip_country" varchar(2),
	"ip_asn" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	CONSTRAINT "sessions_pkey" PRIMARY KEY("id","expires_at")
);
--> statement-breakpoint
CREATE TABLE "system_roles" (
	"id" uuid PRIMARY KEY,
	"user_id" uuid NOT NULL UNIQUE,
	"role" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" varchar(24) PRIMARY KEY,
	"name" varchar(255) NOT NULL,
	"status" varchar DEFAULT 'active' NOT NULL,
	"restrictions" json DEFAULT '{"quotas":{"user":1000,"organization":5,"attachment":100,"page":0},"rateLimits":{"apiPointsPerHour":1000}}' NOT NULL,
	"created_by" uuid,
	"subscription_id" varchar(255),
	"subscription_status" varchar DEFAULT 'none' NOT NULL,
	"subscription_plan" varchar(255),
	"subscription_data" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "tokens" (
	"id" uuid,
	"secret" varchar(255) NOT NULL,
	"single_use_token" varchar(255),
	"type" varchar NOT NULL,
	"email" varchar(255) NOT NULL,
	"user_id" uuid,
	"oauth_account_id" uuid,
	"inactive_membership_id" uuid,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"invoked_at" timestamp with time zone,
	CONSTRAINT "tokens_pkey" PRIMARY KEY("id","expires_at")
);
--> statement-breakpoint
CREATE TABLE "totps" (
	"id" uuid PRIMARY KEY,
	"user_id" uuid NOT NULL,
	"secret" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unsubscribe_tokens" (
	"id" uuid,
	"user_id" uuid NOT NULL,
	"secret" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "unsubscribe_tokens_pkey" PRIMARY KEY("id","created_at")
);
--> statement-breakpoint
CREATE TABLE "user_counters" (
	"user_id" uuid PRIMARY KEY,
	"last_seen_at" timestamp,
	"last_started_at" timestamp,
	"last_sign_in_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "users" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY,
	"entity_type" varchar DEFAULT 'user' NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"slug" varchar(255) NOT NULL UNIQUE,
	"thumbnail_url" varchar(2048),
	"banner_url" varchar(2048),
	"email" varchar(255) NOT NULL UNIQUE,
	"mfa_required" boolean DEFAULT false NOT NULL,
	"first_name" varchar(255),
	"last_name" varchar(255),
	"language" varchar DEFAULT 'en' NOT NULL,
	"newsletter" boolean DEFAULT false NOT NULL,
	"user_flags" jsonb DEFAULT '{}' NOT NULL,
	"updated_at" timestamp,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "yjs_documents" (
	"entity_type" varchar(50),
	"entity_id" uuid,
	"tenant_id" varchar(24) NOT NULL,
	"organization_id" uuid,
	"state" bytea NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "yjs_documents_pkey" PRIMARY KEY("entity_type","entity_id")
);
--> statement-breakpoint
ALTER TABLE "yjs_documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "activities_created_at_index" ON "activities" ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "activities_org_id_index" ON "activities" ("organization_id","id");--> statement-breakpoint
CREATE INDEX "activities_entity_type_subject_id_index" ON "activities" ("entity_type","id");--> statement-breakpoint
CREATE INDEX "attachments_organization_id_index" ON "attachments" ("organization_id");--> statement-breakpoint
CREATE INDEX "attachments_tenant_id_index" ON "attachments" ("tenant_id");--> statement-breakpoint
CREATE INDEX "attachments_created_by_index" ON "attachments" ("created_by");--> statement-breakpoint
CREATE INDEX "attachments_updated_by_index" ON "attachments" ("updated_by");--> statement-breakpoint
CREATE INDEX "attachments_group_id_index" ON "attachments" ("group_id");--> statement-breakpoint
CREATE INDEX "domains_tenant_id_idx" ON "domains" ("tenant_id");--> statement-breakpoint
CREATE INDEX "domains_domain_idx" ON "domains" ("domain");--> statement-breakpoint
CREATE INDEX "emails_user_id_idx" ON "emails" ("user_id");--> statement-breakpoint
CREATE INDEX "inactive_memberships_user_id_idx" ON "inactive_memberships" ("user_id");--> statement-breakpoint
CREATE INDEX "inactive_memberships_created_by_idx" ON "inactive_memberships" ("created_by");--> statement-breakpoint
CREATE INDEX "inactive_memberships_tenant_id_idx" ON "inactive_memberships" ("tenant_id");--> statement-breakpoint
CREATE INDEX "inactive_memberships_email_idx" ON "inactive_memberships" ("email");--> statement-breakpoint
CREATE INDEX "inactive_memberships_org_pending_idx" ON "inactive_memberships" ("organization_id","rejected_at");--> statement-breakpoint
CREATE INDEX "memberships_user_id_idx" ON "memberships" ("user_id");--> statement-breakpoint
CREATE INDEX "memberships_created_by_idx" ON "memberships" ("created_by");--> statement-breakpoint
CREATE INDEX "memberships_updated_by_idx" ON "memberships" ("updated_by");--> statement-breakpoint
CREATE INDEX "memberships_tenant_id_idx" ON "memberships" ("tenant_id");--> statement-breakpoint
CREATE INDEX "memberships_context_org_role_idx" ON "memberships" ("context_type","organization_id","role");--> statement-breakpoint
CREATE INDEX "memberships_org_user_tenant_idx" ON "memberships" ("organization_id","user_id","tenant_id");--> statement-breakpoint
CREATE INDEX "oauth_accounts_user_id_idx" ON "oauth_accounts" ("user_id");--> statement-breakpoint
CREATE INDEX "organizations_name_index" ON "organizations" ("name" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "organizations_created_at_index" ON "organizations" ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "organizations_tenant_id_index" ON "organizations" ("tenant_id");--> statement-breakpoint
CREATE INDEX "organizations_created_by_index" ON "organizations" ("created_by");--> statement-breakpoint
CREATE INDEX "organizations_updated_by_index" ON "organizations" ("updated_by");--> statement-breakpoint
CREATE INDEX "pages_seq_idx" ON "pages" ("seq");--> statement-breakpoint
CREATE INDEX "pages_created_by_idx" ON "pages" ("created_by");--> statement-breakpoint
CREATE INDEX "pages_updated_by_idx" ON "pages" ("updated_by");--> statement-breakpoint
CREATE INDEX "passkeys_user_id_idx" ON "passkeys" ("user_id");--> statement-breakpoint
CREATE INDEX "passkeys_credential_id_idx" ON "passkeys" ("credential_id");--> statement-breakpoint
CREATE INDEX "requests_emails" ON "requests" ("email" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "requests_created_at" ON "requests" ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "seen_by_user_context_type_index" ON "seen_by" ("user_id","context_id","entity_type");--> statement-breakpoint
CREATE INDEX "seen_by_entity_id_index" ON "seen_by" ("entity_id");--> statement-breakpoint
CREATE INDEX "seen_by_tenant_id_index" ON "seen_by" ("tenant_id");--> statement-breakpoint
CREATE INDEX "sessions_secret_idx" ON "sessions" ("secret");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_ip_hash_idx" ON "sessions" ("user_id","ip_hash");--> statement-breakpoint
CREATE INDEX "sessions_ip_subnet_hash_idx" ON "sessions" ("ip_subnet_hash");--> statement-breakpoint
CREATE INDEX "tenants_status_index" ON "tenants" ("status");--> statement-breakpoint
CREATE INDEX "tenants_created_at_index" ON "tenants" ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "tenants_created_by_index" ON "tenants" ("created_by");--> statement-breakpoint
CREATE INDEX "tenants_subscription_status_index" ON "tenants" ("subscription_status");--> statement-breakpoint
CREATE INDEX "tokens_secret_type_idx" ON "tokens" ("secret","type");--> statement-breakpoint
CREATE INDEX "tokens_user_id_idx" ON "tokens" ("user_id");--> statement-breakpoint
CREATE INDEX "tokens_created_by_idx" ON "tokens" ("created_by");--> statement-breakpoint
CREATE INDEX "tokens_single_use_token_idx" ON "tokens" ("type","single_use_token");--> statement-breakpoint
CREATE INDEX "totps_user_id_idx" ON "totps" ("user_id");--> statement-breakpoint
CREATE INDEX "unsubscribe_tokens_secret_idx" ON "unsubscribe_tokens" ("secret");--> statement-breakpoint
CREATE INDEX "unsubscribe_tokens_user_id_idx" ON "unsubscribe_tokens" ("user_id");--> statement-breakpoint
CREATE INDEX "users_name_index" ON "users" ("name" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "users_email_index" ON "users" ("email" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "users_created_at_index" ON "users" ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_yjs_docs_tenant" ON "yjs_documents" ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_yjs_docs_org" ON "yjs_documents" ("organization_id");--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_tenant_id_tenants_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id");--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_created_by_users_id_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_updated_by_users_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_Ytb3N4m0pWsH_fkey" FOREIGN KEY ("tenant_id","organization_id") REFERENCES "organizations"("tenant_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_tenant_id_tenants_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "inactive_memberships" ADD CONSTRAINT "inactive_memberships_tenant_id_tenants_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id");--> statement-breakpoint
ALTER TABLE "inactive_memberships" ADD CONSTRAINT "inactive_memberships_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "inactive_memberships" ADD CONSTRAINT "inactive_memberships_created_by_users_id_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "inactive_memberships" ADD CONSTRAINT "inactive_memberships_gmmCA2ACknk4_fkey" FOREIGN KEY ("tenant_id","organization_id") REFERENCES "organizations"("tenant_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tenant_id_tenants_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id");--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_created_by_users_id_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_updated_by_users_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_Yta3VHtyCTj4_fkey" FOREIGN KEY ("tenant_id","organization_id") REFERENCES "organizations"("tenant_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_tenant_id_tenants_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id");--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_created_by_users_id_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_updated_by_users_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_created_by_users_id_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_updated_by_users_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_parent_id_pages_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "pages"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "passkeys" ADD CONSTRAINT "passkeys_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "seen_by" ADD CONSTRAINT "seen_by_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "system_roles" ADD CONSTRAINT "system_roles_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_created_by_users_id_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_oauth_account_id_oauth_accounts_id_fkey" FOREIGN KEY ("oauth_account_id") REFERENCES "oauth_accounts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_created_by_users_id_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "totps" ADD CONSTRAINT "totps_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "unsubscribe_tokens" ADD CONSTRAINT "unsubscribe_tokens_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_updated_by_users_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "yjs_documents" ADD CONSTRAINT "yjs_documents_tenant_id_tenants_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id");--> statement-breakpoint
ALTER TABLE "yjs_documents" ADD CONSTRAINT "yjs_documents_HY8MgE0sbYNM_fkey" FOREIGN KEY ("tenant_id","organization_id") REFERENCES "organizations"("tenant_id","id") ON DELETE CASCADE;--> statement-breakpoint
CREATE POLICY "attachments_select_policy" ON "attachments" AS PERMISSIVE FOR SELECT TO public USING (
  
  COALESCE(current_setting('app.tenant_id', true), '') != ''
  AND "attachments"."tenant_id" = current_setting('app.tenant_id', true)::text

);--> statement-breakpoint
CREATE POLICY "attachments_insert_policy" ON "attachments" AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "attachments_update_policy" ON "attachments" AS PERMISSIVE FOR UPDATE TO public USING (true);--> statement-breakpoint
CREATE POLICY "attachments_delete_policy" ON "attachments" AS PERMISSIVE FOR DELETE TO public USING (true);--> statement-breakpoint
CREATE POLICY "yjs_documents_select_policy" ON "yjs_documents" AS PERMISSIVE FOR SELECT TO public USING (
  
  COALESCE(current_setting('app.tenant_id', true), '') != ''
  AND "yjs_documents"."tenant_id" = current_setting('app.tenant_id', true)::text

);--> statement-breakpoint
CREATE POLICY "yjs_documents_insert_policy" ON "yjs_documents" AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "yjs_documents_update_policy" ON "yjs_documents" AS PERMISSIVE FOR UPDATE TO public USING (true);--> statement-breakpoint
CREATE POLICY "yjs_documents_delete_policy" ON "yjs_documents" AS PERMISSIVE FOR DELETE TO public USING (true);