CREATE TABLE "activities" (
	"id" varchar NOT NULL,
	"user_id" varchar,
	"entity_type" varchar,
	"resource_type" varchar,
	"action" varchar NOT NULL,
	"table_name" varchar NOT NULL,
	"type" varchar NOT NULL,
	"entity_id" varchar,
	"organization_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"changed_keys" jsonb,
	"tx" jsonb,
	"seq" integer,
	CONSTRAINT "activities_id_created_at_pk" PRIMARY KEY("id","created_at")
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" varchar PRIMARY KEY NOT NULL,
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
CREATE TABLE "emails" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" varchar PRIMARY KEY NOT NULL,
	"email" varchar NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"token_id" varchar,
	"user_id" varchar NOT NULL,
	"verified_at" timestamp,
	CONSTRAINT "emails_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "inactive_memberships" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" varchar PRIMARY KEY NOT NULL,
	"context_type" varchar NOT NULL,
	"email" varchar NOT NULL,
	"user_id" varchar,
	"token_id" varchar,
	"role" varchar DEFAULT 'member' NOT NULL,
	"rejected_at" timestamp,
	"created_by" varchar NOT NULL,
	"organization_id" varchar NOT NULL,
	"unique_key" varchar NOT NULL,
	CONSTRAINT "inactive_memberships_uniqueKey_unique" UNIQUE("unique_key")
);
--> statement-breakpoint
CREATE TABLE "last_seen" (
	"user_id" varchar PRIMARY KEY NOT NULL,
	"last_seen_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" varchar PRIMARY KEY NOT NULL,
	"context_type" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"role" varchar DEFAULT 'member' NOT NULL,
	"created_by" varchar NOT NULL,
	"modified_at" timestamp,
	"modified_by" varchar,
	"archived" boolean DEFAULT false NOT NULL,
	"muted" boolean DEFAULT false NOT NULL,
	"order" double precision NOT NULL,
	"organization_id" varchar NOT NULL,
	"unique_key" varchar NOT NULL,
	CONSTRAINT "memberships_uniqueKey_unique" UNIQUE("unique_key")
);
--> statement-breakpoint
CREATE TABLE "oauth_accounts" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" varchar PRIMARY KEY NOT NULL,
	"provider" varchar NOT NULL,
	"provider_user_id" varchar NOT NULL,
	"email" varchar NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp,
	"user_id" varchar NOT NULL,
	CONSTRAINT "oauth_accounts_provider_providerUserId_email_unique" UNIQUE("provider","provider_user_id","email")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" varchar PRIMARY KEY NOT NULL,
	"entity_type" varchar DEFAULT 'organization' NOT NULL,
	"name" varchar NOT NULL,
	"description" varchar,
	"modified_at" timestamp,
	"slug" varchar NOT NULL,
	"thumbnail_url" varchar,
	"banner_url" varchar,
	"created_by" varchar,
	"modified_by" varchar,
	"short_name" varchar,
	"country" varchar,
	"timezone" varchar,
	"default_language" varchar DEFAULT 'en' NOT NULL,
	"languages" json DEFAULT '["en"]'::json NOT NULL,
	"restrictions" json DEFAULT '{"user":1000,"attachment":100,"page":0}'::json NOT NULL,
	"notification_email" varchar,
	"email_domains" json DEFAULT '[]'::json NOT NULL,
	"color" varchar,
	"logo_url" varchar,
	"website_url" varchar,
	"welcome_text" varchar,
	"auth_strategies" json DEFAULT '[]'::json NOT NULL,
	"chat_support" boolean DEFAULT false NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" varchar PRIMARY KEY NOT NULL,
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
	"id" varchar PRIMARY KEY NOT NULL,
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
	"id" varchar PRIMARY KEY NOT NULL,
	"hashed_password" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"modified_at" timestamp,
	CONSTRAINT "passwords_userId_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" varchar PRIMARY KEY NOT NULL,
	"message" varchar,
	"email" varchar NOT NULL,
	"type" varchar NOT NULL,
	"token_id" varchar
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" varchar NOT NULL,
	"token" varchar NOT NULL,
	"type" varchar DEFAULT 'regular' NOT NULL,
	"user_id" varchar NOT NULL,
	"device_name" varchar,
	"device_type" varchar DEFAULT 'desktop' NOT NULL,
	"device_os" varchar,
	"browser" varchar,
	"auth_strategy" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sessions_id_expires_at_pk" PRIMARY KEY("id","expires_at")
);
--> statement-breakpoint
CREATE TABLE "system_roles" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"role" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"modified_at" timestamp,
	CONSTRAINT "system_roles_userId_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "tokens" (
	"id" varchar NOT NULL,
	"token" varchar NOT NULL,
	"single_use_token" varchar,
	"type" varchar NOT NULL,
	"email" varchar NOT NULL,
	"user_id" varchar,
	"oauth_account_id" varchar,
	"inactive_membership_id" varchar,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"invoked_at" timestamp with time zone,
	CONSTRAINT "tokens_id_expires_at_pk" PRIMARY KEY("id","expires_at")
);
--> statement-breakpoint
CREATE TABLE "totps" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"secret" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unsubscribe_tokens" (
	"id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"token" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unsubscribe_tokens_id_created_at_pk" PRIMARY KEY("id","created_at")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" varchar PRIMARY KEY NOT NULL,
	"entity_type" varchar DEFAULT 'user' NOT NULL,
	"name" varchar NOT NULL,
	"description" varchar,
	"slug" varchar NOT NULL,
	"thumbnail_url" varchar,
	"banner_url" varchar,
	"email" varchar NOT NULL,
	"mfa_required" boolean DEFAULT false NOT NULL,
	"first_name" varchar,
	"last_name" varchar,
	"language" varchar DEFAULT 'en' NOT NULL,
	"newsletter" boolean DEFAULT false NOT NULL,
	"user_flags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"modified_at" timestamp,
	"last_started_at" timestamp,
	"last_sign_in_at" timestamp,
	"modified_by" varchar,
	CONSTRAINT "users_slug_unique" UNIQUE("slug"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_modified_by_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inactive_memberships" ADD CONSTRAINT "inactive_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inactive_memberships" ADD CONSTRAINT "inactive_memberships_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inactive_memberships" ADD CONSTRAINT "inactive_memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "last_seen" ADD CONSTRAINT "last_seen_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_modified_by_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_modified_by_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_modified_by_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_parent_id_pages_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passkeys" ADD CONSTRAINT "passkeys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passwords" ADD CONSTRAINT "passwords_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_roles" ADD CONSTRAINT "system_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_oauth_account_id_oauth_accounts_id_fk" FOREIGN KEY ("oauth_account_id") REFERENCES "public"."oauth_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "totps" ADD CONSTRAINT "totps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unsubscribe_tokens" ADD CONSTRAINT "unsubscribe_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_modified_by_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_created_at_index" ON "activities" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "activities_type_index" ON "activities" USING btree ("type");--> statement-breakpoint
CREATE INDEX "activities_user_id_index" ON "activities" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "activities_entity_id_index" ON "activities" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "activities_table_name_index" ON "activities" USING btree ("table_name");--> statement-breakpoint
CREATE INDEX "activities_tx_id_index" ON "activities" USING btree ((tx->>'id'));--> statement-breakpoint
CREATE INDEX "activities_organization_id_index" ON "activities" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "activities_organization_id_seq_index" ON "activities" USING btree ("organization_id","seq" desc);--> statement-breakpoint
CREATE INDEX "attachments_organization_id_index" ON "attachments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "inactive_memberships_user_id_idx" ON "inactive_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "inactive_memberships_organization_id_idx" ON "inactive_memberships" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "inactive_memberships_email_idx" ON "inactive_memberships" USING btree ("email");--> statement-breakpoint
CREATE INDEX "inactive_memberships_org_pending_idx" ON "inactive_memberships" USING btree ("organization_id","rejected_at");--> statement-breakpoint
CREATE INDEX "memberships_user_id_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "memberships_organization_id_idx" ON "memberships" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "memberships_context_org_role_idx" ON "memberships" USING btree ("context_type","organization_id","role");--> statement-breakpoint
CREATE INDEX "organizations_name_index" ON "organizations" USING btree ("name" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "organizations_created_at_index" ON "organizations" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "requests_emails" ON "requests" USING btree ("email" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "requests_created_at" ON "requests" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "sessions_token_idx" ON "sessions" USING btree ("token");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tokens_token_type_idx" ON "tokens" USING btree ("token","type");--> statement-breakpoint
CREATE INDEX "tokens_user_id_idx" ON "tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "unsubscribe_tokens_token_idx" ON "unsubscribe_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "unsubscribe_tokens_user_id_idx" ON "unsubscribe_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "users_name_index" ON "users" USING btree ("name" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "users_email_index" ON "users" USING btree ("email" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "users_created_at_index" ON "users" USING btree ("created_at" DESC NULLS LAST);