CREATE TABLE "clients" (
	"id" varchar(255) PRIMARY KEY,
	"name" varchar(255) NOT NULL,
	"secret_hash" varchar(255),
	"redirect_uris" jsonb DEFAULT '[]' NOT NULL,
	"logo_uri" varchar(2048),
	"client_uri" varchar(2048),
	"policy_uri" varchar(2048),
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
	"user_code" varchar(255),
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
ALTER TABLE "service_accounts" ADD COLUMN "client_id" varchar(255);--> statement-breakpoint
ALTER TABLE "tenants" ALTER COLUMN "restrictions" SET DEFAULT '{"quotas":{"user":1000,"organization":1,"attachment":100,"serviceAccount":20,"credential":100},"rateLimits":{"apiPointsPerHour":1000},"allowConsentedClients":true}';--> statement-breakpoint
CREATE INDEX "oidc_payloads_grant_id_idx" ON "oidc_payloads" ("grant_id");--> statement-breakpoint
CREATE INDEX "oidc_payloads_uid_idx" ON "oidc_payloads" ("uid");--> statement-breakpoint
CREATE INDEX "oidc_payloads_user_code_idx" ON "oidc_payloads" ("user_code");--> statement-breakpoint
CREATE INDEX "oidc_payloads_expires_at_idx" ON "oidc_payloads" ("expires_at");--> statement-breakpoint
CREATE INDEX "signing_keys_status_idx" ON "signing_keys" ("status");--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_created_by_principals_id_fkey" FOREIGN KEY ("created_by") REFERENCES "principals"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "service_accounts" ADD CONSTRAINT "service_accounts_client_id_clients_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE;