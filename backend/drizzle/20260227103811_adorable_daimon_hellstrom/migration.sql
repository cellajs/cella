CREATE TYPE "tenant_status" AS ENUM('active', 'suspended', 'archived');--> statement-breakpoint
CREATE TABLE "activities" (
	"id" varchar(50),
	"tenant_id" varchar(24),
	"user_id" varchar(50),
	"entity_type" varchar,
	"resource_type" varchar,
	"action" varchar NOT NULL,
	"table_name" varchar(255) NOT NULL,
	"type" varchar(255) NOT NULL,
	"entity_id" varchar(50),
	"organization_id" varchar(50),
	"created_at" timestamp DEFAULT now(),
	"changed_keys" jsonb,
	"stx" jsonb,
	"seq" integer,
	"error" jsonb,
	CONSTRAINT "activities_pkey" PRIMARY KEY("id","created_at")
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" varchar(50) PRIMARY KEY,
	"entity_type" varchar DEFAULT 'attachment' NOT NULL,
	"tenant_id" varchar(24) NOT NULL,
	"name" varchar(255) DEFAULT 'New attachment' NOT NULL,
	"modified_at" timestamp,
	"stx" jsonb NOT NULL,
	"description" varchar(1000000) DEFAULT '',
	"keywords" varchar(1000000) DEFAULT '' NOT NULL,
	"created_by" varchar(50),
	"modified_by" varchar(50),
	"public" boolean DEFAULT false NOT NULL,
	"bucket_name" varchar(255) NOT NULL,
	"group_id" varchar(50),
	"filename" varchar(255) NOT NULL,
	"content_type" varchar(255) NOT NULL,
	"converted_content_type" varchar(255),
	"size" varchar(255) NOT NULL,
	"original_key" varchar(2048) NOT NULL,
	"converted_key" varchar(2048),
	"thumbnail_key" varchar(2048),
	"organization_id" varchar(50) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "context_counters" (
	"context_key" varchar(50) PRIMARY KEY,
	"seq" bigint DEFAULT 0 NOT NULL,
	"m_seq" bigint DEFAULT 0 NOT NULL,
	"counts" jsonb DEFAULT '{}' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "emails" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" varchar(50) PRIMARY KEY,
	"email" varchar(255) NOT NULL UNIQUE,
	"verified" boolean DEFAULT false NOT NULL,
	"token_id" varchar(50),
	"user_id" varchar(50) NOT NULL,
	"verified_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "inactive_memberships" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" varchar(50) PRIMARY KEY,
	"tenant_id" varchar(24) NOT NULL,
	"context_type" varchar NOT NULL,
	"email" varchar(255) NOT NULL,
	"user_id" varchar(50),
	"token_id" varchar(50),
	"role" varchar DEFAULT 'member' NOT NULL,
	"rejected_at" timestamp,
	"created_by" varchar(50) NOT NULL,
	"organization_id" varchar(50) NOT NULL,
	CONSTRAINT "inactive_memberships_tenant_email_ctx" UNIQUE NULLS NOT DISTINCT("tenant_id","email","context_type","organization_id")
);
--> statement-breakpoint
ALTER TABLE "inactive_memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "memberships" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" varchar(50) PRIMARY KEY,
	"tenant_id" varchar(24) NOT NULL,
	"context_type" varchar NOT NULL,
	"user_id" varchar(50) NOT NULL,
	"role" varchar DEFAULT 'member' NOT NULL,
	"created_by" varchar(50) NOT NULL,
	"modified_at" timestamp,
	"modified_by" varchar(50),
	"archived" boolean DEFAULT false NOT NULL,
	"muted" boolean DEFAULT false NOT NULL,
	"display_order" double precision NOT NULL,
	"organization_id" varchar(50) NOT NULL,
	CONSTRAINT "memberships_tenant_user_ctx" UNIQUE NULLS NOT DISTINCT("tenant_id","user_id","context_type","organization_id")
);
--> statement-breakpoint
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "oauth_accounts" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" varchar(50) PRIMARY KEY,
	"provider" varchar NOT NULL,
	"provider_user_id" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp,
	"user_id" varchar(50) NOT NULL,
	CONSTRAINT "oauth_accounts_provider_provider_user_id_email_unique" UNIQUE("provider","provider_user_id","email")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" varchar(50) PRIMARY KEY,
	"entity_type" varchar DEFAULT 'organization' NOT NULL,
	"tenant_id" varchar(24) NOT NULL,
	"name" varchar(255) NOT NULL,
	"modified_at" timestamp,
	"slug" varchar(255) NOT NULL UNIQUE,
	"thumbnail_url" varchar(2048),
	"banner_url" varchar(2048),
	"created_by" varchar(50),
	"modified_by" varchar(50),
	"short_name" varchar(255),
	"country" varchar(255),
	"timezone" varchar(255),
	"default_language" varchar DEFAULT 'en' NOT NULL,
	"languages" json DEFAULT '["en"]' NOT NULL,
	"notification_email" varchar(255),
	"email_domains" json DEFAULT '[]' NOT NULL,
	"color" varchar(255),
	"logo_url" varchar(2048),
	"website_url" varchar(2048),
	"welcome_text" varchar(1000000),
	"auth_strategies" json DEFAULT '[]' NOT NULL,
	"chat_support" boolean DEFAULT false NOT NULL,
	CONSTRAINT "organizations_tenant_id_unique" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pages" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" varchar(50) PRIMARY KEY,
	"entity_type" varchar DEFAULT 'page' NOT NULL,
	"tenant_id" varchar(24) NOT NULL,
	"name" varchar(255) DEFAULT 'New page' NOT NULL,
	"modified_at" timestamp,
	"stx" jsonb NOT NULL,
	"description" varchar(1000000) DEFAULT '',
	"keywords" varchar(1000000) DEFAULT '' NOT NULL,
	"created_by" varchar(50),
	"modified_by" varchar(50),
	"status" varchar DEFAULT 'unpublished' NOT NULL,
	"public_access" boolean DEFAULT false NOT NULL,
	"parent_id" varchar(50),
	"display_order" double precision NOT NULL,
	CONSTRAINT "pages_group_order" UNIQUE("parent_id","display_order")
);
--> statement-breakpoint
ALTER TABLE "pages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "passkeys" (
	"id" varchar(50) PRIMARY KEY,
	"user_id" varchar(50) NOT NULL,
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
CREATE TABLE "passwords" (
	"id" varchar(50) PRIMARY KEY,
	"hashed_password" varchar(255) NOT NULL,
	"user_id" varchar(50) NOT NULL UNIQUE,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"modified_at" timestamp
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
	"id" varchar(50) PRIMARY KEY,
	"message" varchar(255),
	"email" varchar(255) NOT NULL,
	"type" varchar NOT NULL,
	"token_id" varchar(50)
);
--> statement-breakpoint
CREATE TABLE "seen_by" (
	"id" varchar(50) PRIMARY KEY,
	"user_id" varchar(50) NOT NULL,
	"entity_id" varchar(50) NOT NULL,
	"entity_type" varchar NOT NULL,
	"context_id" varchar(50) NOT NULL,
	"organization_id" varchar(50) NOT NULL,
	"tenant_id" varchar(24) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "seen_by_user_entity_unique" UNIQUE("user_id","entity_id")
);
--> statement-breakpoint
CREATE TABLE "seen_counts" (
	"entity_id" varchar(50) PRIMARY KEY,
	"entity_type" varchar NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" varchar(50),
	"secret" varchar(255) NOT NULL,
	"type" varchar DEFAULT 'regular' NOT NULL,
	"user_id" varchar(50) NOT NULL,
	"device_name" varchar(255),
	"device_type" varchar DEFAULT 'desktop' NOT NULL,
	"device_os" varchar(255),
	"browser" varchar(255),
	"auth_strategy" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	CONSTRAINT "sessions_pkey" PRIMARY KEY("id","expires_at")
);
--> statement-breakpoint
CREATE TABLE "system_roles" (
	"id" varchar(50) PRIMARY KEY,
	"user_id" varchar(50) NOT NULL UNIQUE,
	"role" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"modified_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" varchar(24) PRIMARY KEY,
	"name" varchar(255) NOT NULL,
	"status" "tenant_status" DEFAULT 'active'::"tenant_status" NOT NULL,
	"restrictions" json DEFAULT '{"quotas":{"user":1000,"organization":5,"attachment":100,"page":0},"rateLimits":{"apiPointsPerHour":1000}}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"modified_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "tokens" (
	"id" varchar(50),
	"secret" varchar(255) NOT NULL,
	"single_use_token" varchar(255),
	"type" varchar NOT NULL,
	"email" varchar(255) NOT NULL,
	"user_id" varchar(50),
	"oauth_account_id" varchar(50),
	"inactive_membership_id" varchar(50),
	"created_by" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"invoked_at" timestamp with time zone,
	CONSTRAINT "tokens_pkey" PRIMARY KEY("id","expires_at")
);
--> statement-breakpoint
CREATE TABLE "totps" (
	"id" varchar(50) PRIMARY KEY,
	"user_id" varchar(50) NOT NULL,
	"secret" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unsubscribe_tokens" (
	"id" varchar(50),
	"user_id" varchar(50) NOT NULL,
	"secret" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "unsubscribe_tokens_pkey" PRIMARY KEY("id","created_at")
);
--> statement-breakpoint
CREATE TABLE "user_activity" (
	"user_id" varchar(50) PRIMARY KEY,
	"last_seen_at" timestamp,
	"last_started_at" timestamp,
	"last_sign_in_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "users" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" varchar(50) PRIMARY KEY,
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
	"modified_at" timestamp,
	"modified_by" varchar(50)
);
--> statement-breakpoint
CREATE INDEX "activities_created_at_index" ON "activities" ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "activities_type_index" ON "activities" ("type");--> statement-breakpoint
CREATE INDEX "activities_user_id_index" ON "activities" ("user_id");--> statement-breakpoint
CREATE INDEX "activities_entity_id_index" ON "activities" ("entity_id");--> statement-breakpoint
CREATE INDEX "activities_table_name_index" ON "activities" ("table_name");--> statement-breakpoint
CREATE INDEX "activities_tenant_id_index" ON "activities" ("tenant_id");--> statement-breakpoint
CREATE INDEX "activities_stx_id_index" ON "activities" ((stx->>'mutationId'));--> statement-breakpoint
CREATE INDEX "activities_error_lsn_index" ON "activities" ((error->>'lsn')) WHERE error IS NOT NULL;--> statement-breakpoint
CREATE INDEX "activities_organization_id_index" ON "activities" ("organization_id");--> statement-breakpoint
CREATE INDEX "activities_organization_id_seq_index" ON "activities" ("organization_id","seq" desc);--> statement-breakpoint
CREATE INDEX "attachments_organization_id_index" ON "attachments" ("organization_id");--> statement-breakpoint
CREATE INDEX "attachments_tenant_id_index" ON "attachments" ("tenant_id");--> statement-breakpoint
CREATE INDEX "inactive_memberships_user_id_idx" ON "inactive_memberships" ("user_id");--> statement-breakpoint
CREATE INDEX "inactive_memberships_organization_id_idx" ON "inactive_memberships" ("organization_id");--> statement-breakpoint
CREATE INDEX "inactive_memberships_tenant_id_idx" ON "inactive_memberships" ("tenant_id");--> statement-breakpoint
CREATE INDEX "inactive_memberships_email_idx" ON "inactive_memberships" ("email");--> statement-breakpoint
CREATE INDEX "inactive_memberships_org_pending_idx" ON "inactive_memberships" ("organization_id","rejected_at");--> statement-breakpoint
CREATE INDEX "memberships_user_id_idx" ON "memberships" ("user_id");--> statement-breakpoint
CREATE INDEX "memberships_organization_id_idx" ON "memberships" ("organization_id");--> statement-breakpoint
CREATE INDEX "memberships_tenant_id_idx" ON "memberships" ("tenant_id");--> statement-breakpoint
CREATE INDEX "memberships_context_org_role_idx" ON "memberships" ("context_type","organization_id","role");--> statement-breakpoint
CREATE INDEX "organizations_name_index" ON "organizations" ("name" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "organizations_created_at_index" ON "organizations" ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "organizations_tenant_id_index" ON "organizations" ("tenant_id");--> statement-breakpoint
CREATE INDEX "pages_tenant_id_idx" ON "pages" ("tenant_id");--> statement-breakpoint
CREATE INDEX "requests_emails" ON "requests" ("email" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "requests_created_at" ON "requests" ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "seen_by_user_context_type_index" ON "seen_by" ("user_id","context_id","entity_type");--> statement-breakpoint
CREATE INDEX "seen_by_entity_id_index" ON "seen_by" ("entity_id");--> statement-breakpoint
CREATE INDEX "seen_by_tenant_id_index" ON "seen_by" ("tenant_id");--> statement-breakpoint
CREATE INDEX "sessions_secret_idx" ON "sessions" ("secret");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" ("user_id");--> statement-breakpoint
CREATE INDEX "tenants_status_index" ON "tenants" ("status");--> statement-breakpoint
CREATE INDEX "tenants_created_at_index" ON "tenants" ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "tokens_secret_type_idx" ON "tokens" ("secret","type");--> statement-breakpoint
CREATE INDEX "tokens_user_id_idx" ON "tokens" ("user_id");--> statement-breakpoint
CREATE INDEX "unsubscribe_tokens_secret_idx" ON "unsubscribe_tokens" ("secret");--> statement-breakpoint
CREATE INDEX "unsubscribe_tokens_user_id_idx" ON "unsubscribe_tokens" ("user_id");--> statement-breakpoint
CREATE INDEX "users_name_index" ON "users" ("name" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "users_email_index" ON "users" ("email" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "users_created_at_index" ON "users" ("created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_tenant_id_tenants_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id");--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_mcflvig2gMS8_fkey" FOREIGN KEY ("tenant_id","organization_id") REFERENCES "organizations"("tenant_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_tenant_id_tenants_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id");--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_created_by_users_id_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_modified_by_users_id_fkey" FOREIGN KEY ("modified_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_Ytb3N4m0pWsH_fkey" FOREIGN KEY ("tenant_id","organization_id") REFERENCES "organizations"("tenant_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "inactive_memberships" ADD CONSTRAINT "inactive_memberships_tenant_id_tenants_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id");--> statement-breakpoint
ALTER TABLE "inactive_memberships" ADD CONSTRAINT "inactive_memberships_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "inactive_memberships" ADD CONSTRAINT "inactive_memberships_created_by_users_id_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "inactive_memberships" ADD CONSTRAINT "inactive_memberships_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "inactive_memberships" ADD CONSTRAINT "inactive_memberships_gmmCA2ACknk4_fkey" FOREIGN KEY ("tenant_id","organization_id") REFERENCES "organizations"("tenant_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tenant_id_tenants_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id");--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_created_by_users_id_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_modified_by_users_id_fkey" FOREIGN KEY ("modified_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_Yta3VHtyCTj4_fkey" FOREIGN KEY ("tenant_id","organization_id") REFERENCES "organizations"("tenant_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_tenant_id_tenants_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id");--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_created_by_users_id_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_modified_by_users_id_fkey" FOREIGN KEY ("modified_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_tenant_id_tenants_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id");--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_created_by_users_id_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_modified_by_users_id_fkey" FOREIGN KEY ("modified_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_parent_id_pages_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "pages"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "passkeys" ADD CONSTRAINT "passkeys_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "passwords" ADD CONSTRAINT "passwords_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "seen_by" ADD CONSTRAINT "seen_by_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "seen_by" ADD CONSTRAINT "seen_by_tenant_id_tenants_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "seen_by" ADD CONSTRAINT "seen_by_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "system_roles" ADD CONSTRAINT "system_roles_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_oauth_account_id_oauth_accounts_id_fkey" FOREIGN KEY ("oauth_account_id") REFERENCES "oauth_accounts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_created_by_users_id_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "totps" ADD CONSTRAINT "totps_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "unsubscribe_tokens" ADD CONSTRAINT "unsubscribe_tokens_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_activity" ADD CONSTRAINT "user_activity_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_modified_by_users_id_fkey" FOREIGN KEY ("modified_by") REFERENCES "users"("id");--> statement-breakpoint
CREATE POLICY "attachments_select_policy" ON "attachments" AS PERMISSIVE FOR SELECT TO public USING (
  
  COALESCE(current_setting('app.tenant_id', true), '') != ''
  AND "attachments"."tenant_id" = current_setting('app.tenant_id', true)::text

  AND current_setting('app.is_authenticated', true)::boolean = true
  AND 
  COALESCE(current_setting('app.user_id', true), '') != ''
  AND EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.organization_id = "attachments"."organization_id"
    AND m.user_id = current_setting('app.user_id', true)::text
    AND m.tenant_id = "attachments"."tenant_id"
  )

);--> statement-breakpoint
CREATE POLICY "attachments_insert_policy" ON "attachments" AS PERMISSIVE FOR INSERT TO public WITH CHECK (
  
  COALESCE(current_setting('app.tenant_id', true), '') != ''
  AND "attachments"."tenant_id" = current_setting('app.tenant_id', true)::text

  AND current_setting('app.is_authenticated', true)::boolean = true
  AND 
  COALESCE(current_setting('app.user_id', true), '') != ''
  AND EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.organization_id = "attachments"."organization_id"
    AND m.user_id = current_setting('app.user_id', true)::text
    AND m.tenant_id = "attachments"."tenant_id"
  )

);--> statement-breakpoint
CREATE POLICY "attachments_update_policy" ON "attachments" AS PERMISSIVE FOR UPDATE TO public USING (
  
  COALESCE(current_setting('app.tenant_id', true), '') != ''
  AND "attachments"."tenant_id" = current_setting('app.tenant_id', true)::text

  AND current_setting('app.is_authenticated', true)::boolean = true
  AND 
  COALESCE(current_setting('app.user_id', true), '') != ''
  AND EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.organization_id = "attachments"."organization_id"
    AND m.user_id = current_setting('app.user_id', true)::text
    AND m.tenant_id = "attachments"."tenant_id"
  )

) WITH CHECK (
  
  COALESCE(current_setting('app.tenant_id', true), '') != ''
  AND "attachments"."tenant_id" = current_setting('app.tenant_id', true)::text

  AND current_setting('app.is_authenticated', true)::boolean = true
  AND 
  COALESCE(current_setting('app.user_id', true), '') != ''
  AND EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.organization_id = "attachments"."organization_id"
    AND m.user_id = current_setting('app.user_id', true)::text
    AND m.tenant_id = "attachments"."tenant_id"
  )

);--> statement-breakpoint
CREATE POLICY "attachments_delete_policy" ON "attachments" AS PERMISSIVE FOR DELETE TO public USING (
  
  COALESCE(current_setting('app.tenant_id', true), '') != ''
  AND "attachments"."tenant_id" = current_setting('app.tenant_id', true)::text

  AND current_setting('app.is_authenticated', true)::boolean = true
  AND 
  COALESCE(current_setting('app.user_id', true), '') != ''
  AND EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.organization_id = "attachments"."organization_id"
    AND m.user_id = current_setting('app.user_id', true)::text
    AND m.tenant_id = "attachments"."tenant_id"
  )

);--> statement-breakpoint
CREATE POLICY "inactive_memberships_select_policy" ON "inactive_memberships" AS PERMISSIVE FOR SELECT TO public USING (
  
  COALESCE(current_setting('app.tenant_id', true), '') != ''
  AND "inactive_memberships"."tenant_id" = current_setting('app.tenant_id', true)::text

  AND current_setting('app.is_authenticated', true)::boolean = true
  AND 
  COALESCE(current_setting('app.user_id', true), '') != ''
  AND EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.organization_id = "inactive_memberships"."organization_id"
    AND m.user_id = current_setting('app.user_id', true)::text
    AND m.tenant_id = "inactive_memberships"."tenant_id"
  )

);--> statement-breakpoint
CREATE POLICY "inactive_memberships_insert_policy" ON "inactive_memberships" AS PERMISSIVE FOR INSERT TO public WITH CHECK (
  
  COALESCE(current_setting('app.tenant_id', true), '') != ''
  AND "inactive_memberships"."tenant_id" = current_setting('app.tenant_id', true)::text

  AND current_setting('app.is_authenticated', true)::boolean = true
  AND 
  COALESCE(current_setting('app.user_id', true), '') != ''
  AND EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.organization_id = "inactive_memberships"."organization_id"
    AND m.user_id = current_setting('app.user_id', true)::text
    AND m.tenant_id = "inactive_memberships"."tenant_id"
  )

);--> statement-breakpoint
CREATE POLICY "inactive_memberships_update_policy" ON "inactive_memberships" AS PERMISSIVE FOR UPDATE TO public USING (
  
  COALESCE(current_setting('app.tenant_id', true), '') != ''
  AND "inactive_memberships"."tenant_id" = current_setting('app.tenant_id', true)::text

  AND current_setting('app.is_authenticated', true)::boolean = true
  AND 
  COALESCE(current_setting('app.user_id', true), '') != ''
  AND EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.organization_id = "inactive_memberships"."organization_id"
    AND m.user_id = current_setting('app.user_id', true)::text
    AND m.tenant_id = "inactive_memberships"."tenant_id"
  )

) WITH CHECK (
  
  COALESCE(current_setting('app.tenant_id', true), '') != ''
  AND "inactive_memberships"."tenant_id" = current_setting('app.tenant_id', true)::text

  AND current_setting('app.is_authenticated', true)::boolean = true
  AND 
  COALESCE(current_setting('app.user_id', true), '') != ''
  AND EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.organization_id = "inactive_memberships"."organization_id"
    AND m.user_id = current_setting('app.user_id', true)::text
    AND m.tenant_id = "inactive_memberships"."tenant_id"
  )

);--> statement-breakpoint
CREATE POLICY "inactive_memberships_delete_policy" ON "inactive_memberships" AS PERMISSIVE FOR DELETE TO public USING (
  
  COALESCE(current_setting('app.tenant_id', true), '') != ''
  AND "inactive_memberships"."tenant_id" = current_setting('app.tenant_id', true)::text

  AND current_setting('app.is_authenticated', true)::boolean = true
  AND 
  COALESCE(current_setting('app.user_id', true), '') != ''
  AND EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.organization_id = "inactive_memberships"."organization_id"
    AND m.user_id = current_setting('app.user_id', true)::text
    AND m.tenant_id = "inactive_memberships"."tenant_id"
  )

);--> statement-breakpoint
CREATE POLICY "inactive_memberships_select_own_policy" ON "inactive_memberships" AS PERMISSIVE FOR SELECT TO public USING (current_setting('app.is_authenticated', true)::boolean = true AND 
  COALESCE(current_setting('app.user_id', true), '') != ''
  AND "inactive_memberships"."user_id" = current_setting('app.user_id', true)::text
);--> statement-breakpoint
CREATE POLICY "memberships_context_guard" ON "memberships" AS RESTRICTIVE FOR SELECT TO public USING (COALESCE(current_setting('app.tenant_id', true), '') != '' OR COALESCE(current_setting('app.user_id', true), '') != '');--> statement-breakpoint
CREATE POLICY "memberships_select_authenticated_policy" ON "memberships" AS PERMISSIVE FOR SELECT TO public USING (current_setting('app.is_authenticated', true)::boolean = true);--> statement-breakpoint
CREATE POLICY "memberships_insert_policy" ON "memberships" AS PERMISSIVE FOR INSERT TO public WITH CHECK (
  COALESCE(current_setting('app.tenant_id', true), '') != ''
  AND "memberships"."tenant_id" = current_setting('app.tenant_id', true)::text
 AND current_setting('app.is_authenticated', true)::boolean = true);--> statement-breakpoint
CREATE POLICY "memberships_update_policy" ON "memberships" AS PERMISSIVE FOR UPDATE TO public USING (
  COALESCE(current_setting('app.tenant_id', true), '') != ''
  AND "memberships"."tenant_id" = current_setting('app.tenant_id', true)::text
 AND current_setting('app.is_authenticated', true)::boolean = true) WITH CHECK (
  COALESCE(current_setting('app.tenant_id', true), '') != ''
  AND "memberships"."tenant_id" = current_setting('app.tenant_id', true)::text
 AND current_setting('app.is_authenticated', true)::boolean = true);--> statement-breakpoint
CREATE POLICY "memberships_delete_policy" ON "memberships" AS PERMISSIVE FOR DELETE TO public USING (
  COALESCE(current_setting('app.tenant_id', true), '') != ''
  AND "memberships"."tenant_id" = current_setting('app.tenant_id', true)::text
 AND current_setting('app.is_authenticated', true)::boolean = true);--> statement-breakpoint
CREATE POLICY "organizations_select_policy" ON "organizations" AS PERMISSIVE FOR SELECT TO public USING (
        current_setting('app.is_authenticated', true)::boolean = true
        AND COALESCE(current_setting('app.user_id', true), '') != ''
        AND (
          "organizations"."created_by" = current_setting('app.user_id', true)::text
          OR EXISTS (
            SELECT 1 FROM memberships m
            WHERE m.organization_id = "organizations"."id"
            AND m.user_id = current_setting('app.user_id', true)::text
            AND m.tenant_id = "organizations"."tenant_id"
          )
          OR EXISTS (
            SELECT 1 FROM inactive_memberships im
            WHERE im.organization_id = "organizations"."id"
            AND im.user_id = current_setting('app.user_id', true)::text
            AND im.rejected_at IS NULL
          )
        )
      );--> statement-breakpoint
CREATE POLICY "organizations_insert_policy" ON "organizations" AS PERMISSIVE FOR INSERT TO public WITH CHECK (
  COALESCE(current_setting('app.tenant_id', true), '') != ''
  AND "organizations"."tenant_id" = current_setting('app.tenant_id', true)::text
 AND current_setting('app.is_authenticated', true)::boolean = true);--> statement-breakpoint
CREATE POLICY "organizations_update_policy" ON "organizations" AS PERMISSIVE FOR UPDATE TO public USING (
        current_setting('app.is_authenticated', true)::boolean = true
        AND COALESCE(current_setting('app.user_id', true), '') != ''
        AND EXISTS (
          SELECT 1 FROM memberships m
          WHERE m.organization_id = "organizations"."id"
          AND m.user_id = current_setting('app.user_id', true)::text
          AND m.tenant_id = "organizations"."tenant_id"
        )
      ) WITH CHECK (
  COALESCE(current_setting('app.tenant_id', true), '') != ''
  AND "organizations"."tenant_id" = current_setting('app.tenant_id', true)::text
 AND current_setting('app.is_authenticated', true)::boolean = true);--> statement-breakpoint
CREATE POLICY "organizations_delete_policy" ON "organizations" AS PERMISSIVE FOR DELETE TO public USING (
        current_setting('app.is_authenticated', true)::boolean = true
        AND COALESCE(current_setting('app.user_id', true), '') != ''
        AND EXISTS (
          SELECT 1 FROM memberships m
          WHERE m.organization_id = "organizations"."id"
          AND m.user_id = current_setting('app.user_id', true)::text
          AND m.tenant_id = "organizations"."tenant_id"
        )
      );--> statement-breakpoint
CREATE POLICY "pages_select_policy" ON "pages" AS PERMISSIVE FOR SELECT TO public USING (
  
  COALESCE(current_setting('app.tenant_id', true), '') != ''
  AND "pages"."tenant_id" = current_setting('app.tenant_id', true)::text

  AND 
  current_setting('app.is_authenticated', true)::boolean = true OR "pages"."public_access" = true

);--> statement-breakpoint
CREATE POLICY "pages_insert_policy" ON "pages" AS PERMISSIVE FOR INSERT TO public WITH CHECK (
  
  COALESCE(current_setting('app.tenant_id', true), '') != ''
  AND "pages"."tenant_id" = current_setting('app.tenant_id', true)::text

  AND current_setting('app.is_authenticated', true)::boolean = true
);--> statement-breakpoint
CREATE POLICY "pages_update_policy" ON "pages" AS PERMISSIVE FOR UPDATE TO public USING (
  
  COALESCE(current_setting('app.tenant_id', true), '') != ''
  AND "pages"."tenant_id" = current_setting('app.tenant_id', true)::text

  AND current_setting('app.is_authenticated', true)::boolean = true
) WITH CHECK (
  
  COALESCE(current_setting('app.tenant_id', true), '') != ''
  AND "pages"."tenant_id" = current_setting('app.tenant_id', true)::text

  AND current_setting('app.is_authenticated', true)::boolean = true
);--> statement-breakpoint
CREATE POLICY "pages_delete_policy" ON "pages" AS PERMISSIVE FOR DELETE TO public USING (
  
  COALESCE(current_setting('app.tenant_id', true), '') != ''
  AND "pages"."tenant_id" = current_setting('app.tenant_id', true)::text

  AND current_setting('app.is_authenticated', true)::boolean = true
);