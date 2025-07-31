CREATE TABLE "attachments" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" varchar PRIMARY KEY NOT NULL,
	"name" varchar DEFAULT 'attachment' NOT NULL,
	"entity_type" varchar DEFAULT 'attachment' NOT NULL,
	"group_id" varchar,
	"filename" varchar NOT NULL,
	"content_type" varchar NOT NULL,
	"converted_content_type" varchar,
	"size" varchar NOT NULL,
	"original_key" varchar NOT NULL,
	"converted_key" varchar,
	"thumbnail_key" varchar,
	"created_by" varchar,
	"modified_at" timestamp,
	"modified_by" varchar,
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
CREATE TABLE "memberships" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" varchar PRIMARY KEY NOT NULL,
	"context_type" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"role" varchar DEFAULT 'member' NOT NULL,
	"token_id" varchar,
	"activated_at" timestamp,
	"created_by" varchar,
	"modified_at" timestamp,
	"modified_by" varchar,
	"archived" boolean DEFAULT false NOT NULL,
	"muted" boolean DEFAULT false NOT NULL,
	"order" double precision NOT NULL,
	"organization_id" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_accounts" (
	"provider_id" varchar NOT NULL,
	"provider_user_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_accounts_provider_id_provider_user_id_pk" PRIMARY KEY("provider_id","provider_user_id")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" varchar PRIMARY KEY NOT NULL,
	"entity_type" varchar DEFAULT 'organization' NOT NULL,
	"name" varchar NOT NULL,
	"description" varchar,
	"slug" varchar NOT NULL,
	"thumbnail_url" varchar,
	"banner_url" varchar,
	"short_name" varchar,
	"country" varchar,
	"timezone" varchar,
	"default_language" varchar DEFAULT 'en' NOT NULL,
	"languages" json DEFAULT '["en"]'::json NOT NULL,
	"restrictions" json DEFAULT '{"user":1000,"attachment":100}'::json NOT NULL,
	"notification_email" varchar,
	"email_domains" json DEFAULT '[]'::json NOT NULL,
	"color" varchar,
	"logo_url" varchar,
	"website_url" varchar,
	"welcome_text" varchar,
	"auth_strategies" json DEFAULT '[]'::json NOT NULL,
	"chat_support" boolean DEFAULT false NOT NULL,
	"created_by" varchar,
	"modified_at" timestamp,
	"modified_by" varchar,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "passkeys" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_email" varchar NOT NULL,
	"credential_id" varchar NOT NULL,
	"public_key" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
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
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" varchar PRIMARY KEY NOT NULL,
	"token" varchar NOT NULL,
	"type" varchar DEFAULT 'regular' NOT NULL,
	"user_id" varchar NOT NULL,
	"device_name" varchar,
	"device_type" varchar DEFAULT 'desktop' NOT NULL,
	"device_os" varchar,
	"browser" varchar,
	"auth_strategy" varchar NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tokens" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" varchar PRIMARY KEY NOT NULL,
	"token" varchar NOT NULL,
	"type" varchar NOT NULL,
	"email" varchar NOT NULL,
	"entity_type" varchar,
	"role" varchar,
	"user_id" varchar,
	"created_by" varchar,
	"expires_at" timestamp with time zone NOT NULL,
	"organization_id" varchar
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
	"hashed_password" varchar,
	"unsubscribe_token" varchar NOT NULL,
	"first_name" varchar,
	"last_name" varchar,
	"language" varchar DEFAULT 'en' NOT NULL,
	"newsletter" boolean DEFAULT false NOT NULL,
	"role" varchar DEFAULT 'user' NOT NULL,
	"modified_at" timestamp,
	"last_seen_at" timestamp,
	"last_started_at" timestamp,
	"last_sign_in_at" timestamp,
	"modified_by" varchar,
	CONSTRAINT "users_slug_unique" UNIQUE("slug"),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_unsubscribeToken_unique" UNIQUE("unsubscribe_token")
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_modified_by_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_token_id_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_token_id_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_modified_by_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_modified_by_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passkeys" ADD CONSTRAINT "passkeys_user_email_users_email_fk" FOREIGN KEY ("user_email") REFERENCES "public"."users"("email") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_token_id_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_modified_by_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_organization_id_index" ON "attachments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "organizations_name_index" ON "organizations" USING btree ("name" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "organizations_created_at_index" ON "organizations" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "requests_emails" ON "requests" USING btree ("email" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "requests_created_at" ON "requests" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "users_name_index" ON "users" USING btree ("name" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "users_token_index" ON "users" USING btree ("unsubscribe_token");--> statement-breakpoint
CREATE INDEX "users_email_index" ON "users" USING btree ("email" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "users_created_at_index" ON "users" USING btree ("created_at" DESC NULLS LAST);