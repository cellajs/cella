CREATE TABLE "oauth_clients" (
	"id" varchar(255) PRIMARY KEY,
	"name" varchar(255) NOT NULL,
	"secret_hash" varchar(255),
	"redirect_uris" jsonb DEFAULT '[]' NOT NULL,
	"logo_uri" varchar(2048),
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "oidc_payloads" (
	"id" varchar(255),
	"type" varchar(64),
	"payload" jsonb NOT NULL,
	"grant_id" varchar(255),
	"account_id" varchar(255),
	"uid" varchar(255),
	"expires_at" timestamp,
	"consumed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "oidc_payloads_pkey" PRIMARY KEY("type","id")
);
--> statement-breakpoint
CREATE TABLE "signing_keys" (
	"id" varchar(255) PRIMARY KEY,
	"alg" varchar(16) DEFAULT 'RS256' NOT NULL,
	"status" varchar NOT NULL,
	"private_jwk" text NOT NULL,
	"public_jwk" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"retired_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "principals" (
	"id" uuid PRIMARY KEY,
	"kind" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "principals" ("id", "kind", "created_at") SELECT "id", 'user', "created_at" FROM "users";--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY,
	"principal_id" uuid NOT NULL,
	"tenant_id" varchar(24) NOT NULL,
	"name" varchar(255) NOT NULL,
	"prefix" varchar(255) NOT NULL,
	"hash" varchar(255) NOT NULL,
	"last4" varchar(4) NOT NULL,
	"scopes" varchar(255)[],
	"expires_at" timestamp,
	"revoked_at" timestamp,
	"revoked_by" uuid,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_accounts" (
	"id" uuid PRIMARY KEY,
	"tenant_id" varchar(24) NOT NULL,
	"name" varchar(255) NOT NULL,
	"status" varchar DEFAULT 'active' NOT NULL,
	"bindings" jsonb DEFAULT '[]' NOT NULL,
	"oauth_client_id" varchar(255),
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "attachments" DROP CONSTRAINT "attachments_created_by_users_id_fkey";--> statement-breakpoint
ALTER TABLE "attachments" DROP CONSTRAINT "attachments_updated_by_users_id_fkey";--> statement-breakpoint
ALTER TABLE "attachments" DROP CONSTRAINT "attachments_deleted_by_users_id_fkey";--> statement-breakpoint
ALTER TABLE "organizations" DROP CONSTRAINT "organizations_created_by_users_id_fkey";--> statement-breakpoint
ALTER TABLE "organizations" DROP CONSTRAINT "organizations_updated_by_users_id_fkey";--> statement-breakpoint
ALTER TABLE "memberships" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ALTER COLUMN "restrictions" SET DEFAULT '{"quotas":{"user":1000,"organization":1,"attachment":100,"serviceAccount":20,"apiKey":100},"rateLimits":{"apiPointsPerHour":1000},"allowConsentedClients":true}';--> statement-breakpoint
CREATE INDEX "oidc_payloads_grant_id_idx" ON "oidc_payloads" ("grant_id");--> statement-breakpoint
CREATE INDEX "oidc_payloads_account_id_idx" ON "oidc_payloads" ("account_id");--> statement-breakpoint
CREATE INDEX "oidc_payloads_uid_idx" ON "oidc_payloads" ("uid");--> statement-breakpoint
CREATE INDEX "oidc_payloads_expires_at_idx" ON "oidc_payloads" ("expires_at");--> statement-breakpoint
CREATE INDEX "signing_keys_status_idx" ON "signing_keys" ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "signing_keys_one_per_status_idx" ON "signing_keys" ("status") WHERE "status" in ('current', 'next');--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_hash_idx" ON "api_keys" ("hash");--> statement-breakpoint
CREATE INDEX "api_keys_principal_id_idx" ON "api_keys" ("principal_id");--> statement-breakpoint
CREATE INDEX "api_keys_tenant_id_idx" ON "api_keys" ("tenant_id");--> statement-breakpoint
CREATE INDEX "service_accounts_tenant_id_idx" ON "service_accounts" ("tenant_id");--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_created_by_principals_id_fkey" FOREIGN KEY ("created_by") REFERENCES "principals"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_updated_by_principals_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "principals"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_deleted_by_principals_id_fkey" FOREIGN KEY ("deleted_by") REFERENCES "principals"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD CONSTRAINT "oauth_clients_created_by_principals_id_fkey" FOREIGN KEY ("created_by") REFERENCES "principals"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_created_by_principals_id_fkey" FOREIGN KEY ("created_by") REFERENCES "principals"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_updated_by_principals_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "principals"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_principal_id_principals_id_fkey" FOREIGN KEY ("principal_id") REFERENCES "principals"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_tenant_id_tenants_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_revoked_by_principals_id_fkey" FOREIGN KEY ("revoked_by") REFERENCES "principals"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_principals_id_fkey" FOREIGN KEY ("created_by") REFERENCES "principals"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "service_accounts" ADD CONSTRAINT "service_accounts_id_principals_id_fkey" FOREIGN KEY ("id") REFERENCES "principals"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "service_accounts" ADD CONSTRAINT "service_accounts_tenant_id_tenants_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "service_accounts" ADD CONSTRAINT "service_accounts_oauth_client_id_oauth_clients_id_fkey" FOREIGN KEY ("oauth_client_id") REFERENCES "oauth_clients"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "service_accounts" ADD CONSTRAINT "service_accounts_created_by_principals_id_fkey" FOREIGN KEY ("created_by") REFERENCES "principals"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "service_accounts" ADD CONSTRAINT "service_accounts_updated_by_principals_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "principals"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_id_principals_id_fkey" FOREIGN KEY ("id") REFERENCES "principals"("id") ON DELETE CASCADE;