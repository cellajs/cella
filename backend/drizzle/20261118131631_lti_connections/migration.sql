ALTER TABLE "tokens" ADD COLUMN "tenant_id" varchar(24);--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "issuer" varchar(255);--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "client_id" varchar(255);--> statement-breakpoint
ALTER TABLE "tokens" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "connections" ALTER COLUMN "federation" DROP NOT NULL;--> statement-breakpoint
DROP INDEX "connections_tenant_id_kind_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "connections_tenant_id_kind_idx" ON "connections" ("tenant_id","kind") WHERE "kind" = 'sso';--> statement-breakpoint
CREATE UNIQUE INDEX "connections_issuer_client_id_idx" ON "connections" ("issuer","client_id");--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_tenant_id_tenants_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_subject_check" CHECK (("email" IS NULL) <> ("tenant_id" IS NULL));--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_kind_check" CHECK (("kind" = 'sso' AND "federation" IS NOT NULL) OR ("kind" = 'lti' AND "issuer" IS NOT NULL AND "client_id" IS NOT NULL));