CREATE TABLE "connections" (
	"id" uuid PRIMARY KEY,
	"tenant_id" varchar(24) NOT NULL,
	"kind" varchar DEFAULT 'sso' NOT NULL,
	"issuer" varchar(255) NOT NULL,
	"client_id" varchar(255),
	"deployment_id" varchar(255),
	"claim_values" varchar(255)[] DEFAULT '{}'::varchar(255)[] NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"jit_provisioning" boolean DEFAULT true NOT NULL,
	"config" jsonb DEFAULT '{}' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
DROP TABLE "domains";--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "connection_id" uuid;--> statement-breakpoint
ALTER TABLE "identities" ALTER COLUMN "connection_id" SET DATA TYPE uuid USING "connection_id"::uuid;--> statement-breakpoint
CREATE INDEX "connections_tenant_id_idx" ON "connections" ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "connections_tenant_id_kind_idx" ON "connections" ("tenant_id","kind");--> statement-breakpoint
ALTER TABLE "identities" ADD CONSTRAINT "identities_connection_id_connections_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "connections"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_connection_id_connections_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "connections"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_connection_id_connections_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "connections"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_tenant_id_tenants_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_created_by_actors_id_fkey" FOREIGN KEY ("created_by") REFERENCES "actors"("id") ON DELETE SET NULL;