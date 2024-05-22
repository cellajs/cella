CREATE TABLE IF NOT EXISTS "users" (
	"id" varchar PRIMARY KEY NOT NULL,
	"hashed_password" varchar,
	"slug" varchar NOT NULL,
	"name" varchar NOT NULL,
	"first_name" varchar,
	"last_name" varchar,
	"email" varchar NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"bio" varchar,
	"language" varchar DEFAULT 'en' NOT NULL,
	"banner_url" varchar,
	"thumbnail_url" varchar,
	"newsletter" boolean DEFAULT false NOT NULL,
	"last_seen_at" timestamp,
	"last_visit_at" timestamp,
	"last_sign_in_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"modified_at" timestamp,
	"modified_by" varchar,
	"role" varchar DEFAULT 'USER' NOT NULL,
	CONSTRAINT "users_slug_unique" UNIQUE("slug"),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_modified_by_users_id_fk" FOREIGN KEY("modified_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organizations" (
	"id" varchar PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"short_name" varchar,
	"slug" varchar NOT NULL,
	"country" varchar,
	"timezone" varchar,
	"default_language" varchar DEFAULT 'en' NOT NULL,
	"languages" json DEFAULT '["en"]'::json NOT NULL,
	"notification_email" varchar,
	"email_domains" json,
	"brand_color" varchar,
	"thumbnail_url" varchar,
	"logo_url" varchar,
	"banner_url" varchar,
	"website_url" varchar,
	"welcome_text" varchar,
	"is_production" boolean DEFAULT false NOT NULL,
	"auth_strategies" json,
	"chat_support" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" varchar,
	"modified_at" timestamp,
	"modified_by" varchar,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug"),
	CONSTRAINT "organizations_created_by_users_id_fk" FOREIGN KEY("created_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "organizations_modified_by_users_id_fk" FOREIGN KEY("modified_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workspaces" (
	"id" varchar PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"slug" varchar NOT NULL,
	"organization_id" varchar NOT NULL,
	"thumbnail_url" varchar,
	"banner_url" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" varchar,
	"modified_at" timestamp,
	"modified_by" varchar,
	CONSTRAINT "workspaces_slug_unique" UNIQUE("slug"),
	CONSTRAINT "workspaces_organization_id_organizations_id_fk" FOREIGN KEY("organization_id") REFERENCES "organizations"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "workspaces_created_by_users_id_fk" FOREIGN KEY("created_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "workspaces_modified_by_users_id_fk" FOREIGN KEY("modified_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "projects" (
	"id" varchar PRIMARY KEY NOT NULL,
	"slug" varchar NOT NULL,
	"name" varchar NOT NULL,
	"color" varchar NOT NULL,
	"workspace_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" varchar,
	"modified_at" timestamp,
	"modified_by" varchar,
	CONSTRAINT "projects_workspace_id_workspaces_id_fk" FOREIGN KEY("workspace_id") REFERENCES "workspaces"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "projects_created_by_users_id_fk" FOREIGN KEY("created_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "projects_modified_by_users_id_fk" FOREIGN KEY("modified_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tasks" (
	"id" varchar PRIMARY KEY NOT NULL,
	"slug" varchar NOT NULL,
	"markdown" varchar,
	"summary" varchar NOT NULL,
	"type" varchar NOT NULL,
	"impact" integer,
	"sort_order" integer,
	"status" integer NOT NULL,
	"project_id" varchar NOT NULL,
	"created_at" timestamp NOT NULL,
	"created_by" varchar NOT NULL,
	"assigned_by" varchar,
	"assigned_at" timestamp,
	"modified_at" timestamp,
	"modified_by" varchar
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "labels" (
	"id" varchar PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"color" varchar,
	"project_id" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "memberships" (
	"id" varchar PRIMARY KEY NOT NULL,
	"type" varchar DEFAULT 'ORGANIZATION' NOT NULL,
	"organization_id" varchar,
	"workspace_id" varchar,
	"project_id" varchar,
	"task_id" varchar,
	"label_id" varchar,
	"user_id" varchar,
	"role" varchar DEFAULT 'MEMBER' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" varchar,
	"modified_at" timestamp,
	"modified_by" varchar,
	"inactive" boolean DEFAULT false,
	"muted" boolean DEFAULT false,
	CONSTRAINT "memberships_organization_id_organizations_id_fk" FOREIGN KEY("organization_id") REFERENCES "organizations"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "memberships_workspace_id_workspaces_id_fk" FOREIGN KEY("workspace_id") REFERENCES "workspaces"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "memberships_project_id_projects_id_fk" FOREIGN KEY("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "memberships_task_id_tasks_id_fk" FOREIGN KEY("task_id") REFERENCES "tasks"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "memberships_label_id_labels_id_fk" FOREIGN KEY("label_id") REFERENCES "labels"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "memberships_created_by_users_id_fk" FOREIGN KEY("created_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "memberships_modified_by_users_id_fk" FOREIGN KEY("modified_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "oauth_accounts" (
	"provider_id" varchar NOT NULL,
	"provider_user_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_accounts_provider_id_provider_user_id_pk" PRIMARY KEY("provider_id","provider_user_id"),
	CONSTRAINT "oauth_accounts_user_id_users_id_fk" FOREIGN KEY("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "requests" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar,
	"organization_id" varchar,
	"accompanying_message" varchar,
	"email" varchar NOT NULL,
	"type" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "requests_user_id_users_id_fk" FOREIGN KEY("user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "requests_organization_id_organizations_id_fk" FOREIGN KEY("organization_id") REFERENCES "organizations"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tokens" (
	"id" varchar PRIMARY KEY NOT NULL,
	"type" varchar NOT NULL,
	"email" varchar,
	"role" varchar,
	"user_id" varchar,
	"organization_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "tokens_user_id_users_id_fk" FOREIGN KEY("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "tokens_organization_id_organizations_id_fk" FOREIGN KEY("organization_id") REFERENCES "organizations"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organizations_name_index" ON "organizations" ("name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organizations_created_at_index" ON "organizations" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "requests_emails" ON "requests" ("email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "requests_created_at" ON "requests" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_name_index" ON "users" ("name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_email_index" ON "users" ("email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_created_at_index" ON "users" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspace_name_index" ON "workspaces" ("name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspace_created_at_index" ON "workspaces" ("created_at");