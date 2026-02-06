CREATE TABLE "activities" (
	"id" varchar,
	"user_id" varchar,
	"entity_type" varchar,
	"resource_type" varchar,
	"action" varchar NOT NULL,
	"table_name" varchar NOT NULL,
	"type" varchar NOT NULL,
	"entity_id" varchar,
	"organization_id" varchar,
	"created_at" timestamp DEFAULT now(),
	"changed_keys" jsonb,
	"tx" jsonb,
	"seq" integer,
	"error" jsonb,
	CONSTRAINT "activities_pkey" PRIMARY KEY("id","created_at")
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" varchar PRIMARY KEY,
	"entity_type" varchar DEFAULT 'attachment' NOT NULL,
	"name" varchar DEFAULT 'New attachment' NOT NULL,
	"description" varchar,
	"modified_at" timestamp,
	"keywords" varchar NOT NULL,
	"created_by" varchar,
	"modified_by" varchar,
	"tx" jsonb NOT NULL,
	"public" boolean DEFAULT false NOT NULL,
	"bucket_name" varchar NOT NULL,
	"group_id" varchar,
	"filename" varchar NOT NULL,
	"content_type" varchar NOT NULL,
	"converted_content_type" varchar,
	"size" varchar NOT NULL,
	"original_key" varchar NOT NULL,
	"converted_key" varchar,
	"thumbnail_key" varchar,
	"organization_id" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE "counters" (
	"namespace" varchar,
	"scope" varchar,
	"key" varchar DEFAULT '',
	"value" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "counters_pkey" PRIMARY KEY("namespace","scope","key")
);
--> statement-breakpoint
CREATE TABLE "emails" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" varchar PRIMARY KEY,
	"email" varchar NOT NULL UNIQUE,
	"verified" boolean DEFAULT false NOT NULL,
	"token_id" varchar,
	"user_id" varchar NOT NULL,
	"verified_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "inactive_memberships" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" varchar PRIMARY KEY,
	"context_type" varchar NOT NULL,
	"email" varchar NOT NULL,
	"user_id" varchar,
	"token_id" varchar,
	"role" varchar DEFAULT 'member' NOT NULL,
	"rejected_at" timestamp,
	"created_by" varchar NOT NULL,
	"organization_id" varchar NOT NULL,
	"unique_key" varchar NOT NULL UNIQUE
);
--> statement-breakpoint
CREATE TABLE "last_seen" (
	"user_id" varchar PRIMARY KEY,
	"last_seen_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" varchar PRIMARY KEY,
	"context_type" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"role" varchar DEFAULT 'member' NOT NULL,
	"created_by" varchar NOT NULL,
	"modified_at" timestamp,
	"modified_by" varchar,
	"archived" boolean DEFAULT false NOT NULL,
	"muted" boolean DEFAULT false NOT NULL,
	"display_order" double precision NOT NULL,
	"organization_id" varchar NOT NULL,
	"unique_key" varchar NOT NULL UNIQUE
);
--> statement-breakpoint
CREATE TABLE "oauth_accounts" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" varchar PRIMARY KEY,
	"provider" varchar NOT NULL,
	"provider_user_id" varchar NOT NULL,
	"email" varchar NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp,
	"user_id" varchar NOT NULL,
	CONSTRAINT "oauth_accounts_provider_provider_user_id_email_unique" UNIQUE("provider","provider_user_id","email")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" varchar PRIMARY KEY,
	"entity_type" varchar DEFAULT 'organization' NOT NULL,
	"name" varchar NOT NULL,
	"description" varchar,
	"modified_at" timestamp,
	"slug" varchar NOT NULL UNIQUE,
	"thumbnail_url" varchar,
	"banner_url" varchar,
	"created_by" varchar,
	"modified_by" varchar,
	"short_name" varchar,
	"country" varchar,
	"timezone" varchar,
	"default_language" varchar DEFAULT 'en' NOT NULL,
	"languages" json DEFAULT '["en"]' NOT NULL,
	"restrictions" json DEFAULT '{"user":1000,"attachment":100,"page":0}' NOT NULL,
	"notification_email" varchar,
	"email_domains" json DEFAULT '[]' NOT NULL,
	"color" varchar,
	"logo_url" varchar,
	"website_url" varchar,
	"welcome_text" varchar,
	"auth_strategies" json DEFAULT '[]' NOT NULL,
	"chat_support" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" varchar PRIMARY KEY,
	"entity_type" varchar DEFAULT 'page' NOT NULL,
	"name" varchar DEFAULT 'New page' NOT NULL,
	"description" varchar,
	"modified_at" timestamp,
	"keywords" varchar NOT NULL,
	"created_by" varchar,
	"modified_by" varchar,
	"tx" jsonb NOT NULL,
	"status" varchar DEFAULT 'unpublished' NOT NULL,
	"parent_id" varchar,
	"display_order" double precision NOT NULL,
	CONSTRAINT "group_order" UNIQUE("parent_id","display_order")
);
--> statement-breakpoint
CREATE TABLE "passkeys" (
	"id" varchar PRIMARY KEY,
	"user_id" varchar NOT NULL,
	"credential_id" varchar NOT NULL,
	"public_key" varchar NOT NULL,
	"device_name" varchar,
	"device_type" varchar DEFAULT 'desktop' NOT NULL,
	"device_os" varchar,
	"browser" varchar,
	"name_on_device" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passwords" (
	"id" varchar PRIMARY KEY,
	"hashed_password" varchar NOT NULL,
	"user_id" varchar NOT NULL UNIQUE,
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
	"id" varchar PRIMARY KEY,
	"message" varchar,
	"email" varchar NOT NULL,
	"type" varchar NOT NULL,
	"token_id" varchar
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" varchar,
	"token" varchar NOT NULL,
	"type" varchar DEFAULT 'regular' NOT NULL,
	"user_id" varchar NOT NULL,
	"device_name" varchar,
	"device_type" varchar DEFAULT 'desktop' NOT NULL,
	"device_os" varchar,
	"browser" varchar,
	"auth_strategy" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	CONSTRAINT "sessions_pkey" PRIMARY KEY("id","expires_at")
);
--> statement-breakpoint
CREATE TABLE "system_roles" (
	"id" varchar PRIMARY KEY,
	"user_id" varchar NOT NULL UNIQUE,
	"role" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"modified_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "tokens" (
	"id" varchar,
	"token" varchar NOT NULL,
	"single_use_token" varchar,
	"type" varchar NOT NULL,
	"email" varchar NOT NULL,
	"user_id" varchar,
	"oauth_account_id" varchar,
	"inactive_membership_id" varchar,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"invoked_at" timestamp with time zone,
	CONSTRAINT "tokens_pkey" PRIMARY KEY("id","expires_at")
);
--> statement-breakpoint
CREATE TABLE "totps" (
	"id" varchar PRIMARY KEY,
	"user_id" varchar NOT NULL,
	"secret" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unsubscribe_tokens" (
	"id" varchar,
	"user_id" varchar NOT NULL,
	"token" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "unsubscribe_tokens_pkey" PRIMARY KEY("id","created_at")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" varchar PRIMARY KEY,
	"entity_type" varchar DEFAULT 'user' NOT NULL,
	"name" varchar NOT NULL,
	"description" varchar,
	"slug" varchar NOT NULL UNIQUE,
	"thumbnail_url" varchar,
	"banner_url" varchar,
	"email" varchar NOT NULL UNIQUE,
	"mfa_required" boolean DEFAULT false NOT NULL,
	"first_name" varchar,
	"last_name" varchar,
	"language" varchar DEFAULT 'en' NOT NULL,
	"newsletter" boolean DEFAULT false NOT NULL,
	"user_flags" jsonb DEFAULT '{}' NOT NULL,
	"modified_at" timestamp,
	"last_started_at" timestamp,
	"last_sign_in_at" timestamp,
	"modified_by" varchar
);
--> statement-breakpoint
CREATE INDEX "activities_created_at_index" ON "activities" ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "activities_type_index" ON "activities" ("type");--> statement-breakpoint
CREATE INDEX "activities_user_id_index" ON "activities" ("user_id");--> statement-breakpoint
CREATE INDEX "activities_entity_id_index" ON "activities" ("entity_id");--> statement-breakpoint
CREATE INDEX "activities_table_name_index" ON "activities" ("table_name");--> statement-breakpoint
CREATE INDEX "activities_tx_id_index" ON "activities" ((tx->>'id'));--> statement-breakpoint
CREATE INDEX "activities_error_lsn_index" ON "activities" ((error->>'lsn')) WHERE error IS NOT NULL;--> statement-breakpoint
CREATE INDEX "activities_organization_id_index" ON "activities" ("organization_id");--> statement-breakpoint
CREATE INDEX "activities_organization_id_seq_index" ON "activities" ("organization_id","seq" desc);--> statement-breakpoint
CREATE INDEX "attachments_organization_id_index" ON "attachments" ("organization_id");--> statement-breakpoint
CREATE INDEX "counters_scope_idx" ON "counters" ("scope");--> statement-breakpoint
CREATE INDEX "inactive_memberships_user_id_idx" ON "inactive_memberships" ("user_id");--> statement-breakpoint
CREATE INDEX "inactive_memberships_organization_id_idx" ON "inactive_memberships" ("organization_id");--> statement-breakpoint
CREATE INDEX "inactive_memberships_email_idx" ON "inactive_memberships" ("email");--> statement-breakpoint
CREATE INDEX "inactive_memberships_org_pending_idx" ON "inactive_memberships" ("organization_id","rejected_at");--> statement-breakpoint
CREATE INDEX "memberships_user_id_idx" ON "memberships" ("user_id");--> statement-breakpoint
CREATE INDEX "memberships_organization_id_idx" ON "memberships" ("organization_id");--> statement-breakpoint
CREATE INDEX "memberships_context_org_role_idx" ON "memberships" ("context_type","organization_id","role");--> statement-breakpoint
CREATE INDEX "organizations_name_index" ON "organizations" ("name" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "organizations_created_at_index" ON "organizations" ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "requests_emails" ON "requests" ("email" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "requests_created_at" ON "requests" ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "sessions_token_idx" ON "sessions" ("token");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" ("user_id");--> statement-breakpoint
CREATE INDEX "tokens_token_type_idx" ON "tokens" ("token","type");--> statement-breakpoint
CREATE INDEX "tokens_user_id_idx" ON "tokens" ("user_id");--> statement-breakpoint
CREATE INDEX "unsubscribe_tokens_token_idx" ON "unsubscribe_tokens" ("token");--> statement-breakpoint
CREATE INDEX "unsubscribe_tokens_user_id_idx" ON "unsubscribe_tokens" ("user_id");--> statement-breakpoint
CREATE INDEX "users_name_index" ON "users" ("name" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "users_email_index" ON "users" ("email" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "users_created_at_index" ON "users" ("created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_created_by_users_id_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_modified_by_users_id_fkey" FOREIGN KEY ("modified_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "inactive_memberships" ADD CONSTRAINT "inactive_memberships_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "inactive_memberships" ADD CONSTRAINT "inactive_memberships_created_by_users_id_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "inactive_memberships" ADD CONSTRAINT "inactive_memberships_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "last_seen" ADD CONSTRAINT "last_seen_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_created_by_users_id_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_modified_by_users_id_fkey" FOREIGN KEY ("modified_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_created_by_users_id_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_modified_by_users_id_fkey" FOREIGN KEY ("modified_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_created_by_users_id_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_modified_by_users_id_fkey" FOREIGN KEY ("modified_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_parent_id_pages_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "pages"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "passkeys" ADD CONSTRAINT "passkeys_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "passwords" ADD CONSTRAINT "passwords_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "system_roles" ADD CONSTRAINT "system_roles_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_oauth_account_id_oauth_accounts_id_fkey" FOREIGN KEY ("oauth_account_id") REFERENCES "oauth_accounts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_created_by_users_id_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "totps" ADD CONSTRAINT "totps_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "unsubscribe_tokens" ADD CONSTRAINT "unsubscribe_tokens_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_modified_by_users_id_fkey" FOREIGN KEY ("modified_by") REFERENCES "users"("id");