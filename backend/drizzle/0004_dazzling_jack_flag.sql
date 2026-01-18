CREATE TABLE "deployments" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" varchar PRIMARY KEY NOT NULL,
	"entity_type" varchar DEFAULT 'deployment' NOT NULL,
	"name" varchar NOT NULL,
	"description" varchar,
	"modified_at" timestamp,
	"commit_sha" varchar NOT NULL,
	"commit_message" varchar,
	"branch" varchar NOT NULL,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"artifact_source" varchar DEFAULT 'release' NOT NULL,
	"artifact_url" varchar,
	"s3_path" varchar,
	"deployed_url" varchar,
	"completed_at" varchar,
	"logs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error_message" varchar,
	"triggered_by" varchar,
	"repository_id" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domains" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" varchar PRIMARY KEY NOT NULL,
	"entity_type" varchar DEFAULT 'domain' NOT NULL,
	"name" varchar NOT NULL,
	"description" varchar,
	"modified_at" timestamp,
	"fqdn" varchar NOT NULL,
	"type" varchar DEFAULT 'subdomain' NOT NULL,
	"verification_status" varchar DEFAULT 'pending' NOT NULL,
	"verification_token" varchar NOT NULL,
	"verification_method" varchar DEFAULT 'txt' NOT NULL,
	"last_verification_attempt" varchar,
	"verification_error" varchar,
	"ssl_status" varchar DEFAULT 'pending' NOT NULL,
	"ssl_error" varchar,
	"scaleway_pipeline_id" varchar,
	"scaleway_dns_stage_id" varchar,
	"scaleway_tls_stage_id" varchar,
	"required_cname_target" varchar,
	"repository_id" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repositories" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" varchar PRIMARY KEY NOT NULL,
	"entity_type" varchar DEFAULT 'repository' NOT NULL,
	"name" varchar DEFAULT 'New repository' NOT NULL,
	"description" varchar,
	"modified_at" timestamp,
	"keywords" varchar NOT NULL,
	"created_by" varchar,
	"modified_by" varchar,
	"github_repo_id" integer NOT NULL,
	"github_repo_name" varchar NOT NULL,
	"github_owner" varchar NOT NULL,
	"github_full_name" varchar NOT NULL,
	"github_default_branch" varchar DEFAULT 'main' NOT NULL,
	"branch" varchar DEFAULT 'main' NOT NULL,
	"build_artifact_path" varchar DEFAULT 'dist' NOT NULL,
	"s3_bucket_name" varchar,
	"scaleway_pipeline_id" varchar,
	"default_domain" varchar,
	"webhook_id" integer,
	"webhook_secret" varchar,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_deployed_at" varchar,
	"organization_id" varchar NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "restrictions" SET DEFAULT '{"user":1000,"attachment":100,"page":0,"repository":0,"deployment":0,"domain":0}'::json;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_triggered_by_users_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_modified_by_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deployments_repository_id_index" ON "deployments" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "deployments_status_index" ON "deployments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "deployments_is_active_index" ON "deployments" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "deployments_created_at_index" ON "deployments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "domains_repository_id_index" ON "domains" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "domains_fqdn_index" ON "domains" USING btree ("fqdn");--> statement-breakpoint
CREATE INDEX "domains_verification_status_index" ON "domains" USING btree ("verification_status");--> statement-breakpoint
CREATE INDEX "repositories_organization_id_index" ON "repositories" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "repositories_github_repo_id_index" ON "repositories" USING btree ("github_repo_id");