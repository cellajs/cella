CREATE TABLE "credentials" (
	"id" uuid PRIMARY KEY,
	"principal_id" uuid NOT NULL,
	"tenant_id" varchar(24) NOT NULL,
	"type" varchar DEFAULT 'secret' NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" varchar(255),
	"prefix" varchar(255) NOT NULL,
	"hash" varchar(255) NOT NULL,
	"last4" varchar(4) NOT NULL,
	"scopes" varchar(255)[],
	"expires_at" timestamp,
	"revoked_at" timestamp,
	"last_used_at" timestamp,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_accounts" (
	"id" uuid PRIMARY KEY,
	"tenant_id" varchar(24) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" varchar(255),
	"status" varchar DEFAULT 'active' NOT NULL,
	"grants" jsonb DEFAULT '[]' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	"last_used_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "tenants" ALTER COLUMN "restrictions" SET DEFAULT '{"quotas":{"user":1000,"organization":1,"attachment":100,"serviceAccount":20,"credential":100},"rateLimits":{"apiPointsPerHour":1000}}';--> statement-breakpoint
CREATE UNIQUE INDEX "credentials_hash_idx" ON "credentials" ("hash");--> statement-breakpoint
CREATE INDEX "credentials_principal_id_idx" ON "credentials" ("principal_id");--> statement-breakpoint
CREATE INDEX "credentials_tenant_id_idx" ON "credentials" ("tenant_id");--> statement-breakpoint
CREATE INDEX "service_accounts_tenant_id_idx" ON "service_accounts" ("tenant_id");--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_principal_id_principals_id_fkey" FOREIGN KEY ("principal_id") REFERENCES "principals"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_tenant_id_tenants_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_created_by_principals_id_fkey" FOREIGN KEY ("created_by") REFERENCES "principals"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "service_accounts" ADD CONSTRAINT "service_accounts_id_principals_id_fkey" FOREIGN KEY ("id") REFERENCES "principals"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "service_accounts" ADD CONSTRAINT "service_accounts_tenant_id_tenants_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "service_accounts" ADD CONSTRAINT "service_accounts_created_by_principals_id_fkey" FOREIGN KEY ("created_by") REFERENCES "principals"("id") ON DELETE SET NULL;