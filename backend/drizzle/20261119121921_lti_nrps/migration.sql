DROP INDEX "lti_contexts_connection_id_context_id_idx";--> statement-breakpoint
DROP INDEX "lti_resource_links_channel_id_idx";--> statement-breakpoint
ALTER TABLE "lti_contexts" ADD COLUMN "issuer" varchar(255);--> statement-breakpoint
UPDATE "lti_contexts" SET "issuer" = "connections"."issuer" FROM "connections" WHERE "connections"."id" = "lti_contexts"."connection_id";--> statement-breakpoint
ALTER TABLE "lti_contexts" ALTER COLUMN "issuer" SET NOT NULL;--> statement-breakpoint
DELETE FROM "lti_contexts" AS "later" USING "lti_contexts" AS "first" WHERE "later"."tenant_id" = "first"."tenant_id" AND "later"."issuer" = "first"."issuer" AND "later"."context_id" = "first"."context_id" AND ("later"."created_at", "later"."id") > ("first"."created_at", "first"."id");--> statement-breakpoint
ALTER TABLE "lti_contexts" ADD COLUMN "memberships_url" varchar(2048);--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "private_jwk" text;--> statement-breakpoint
ALTER TABLE "identities" ADD COLUMN "tenant_id" varchar(24);--> statement-breakpoint
UPDATE "identities" SET "tenant_id" = "connections"."tenant_id" FROM "connections" WHERE "identities"."kind" = 'lti' AND "connections"."id" = "identities"."connection_id";--> statement-breakpoint
ALTER TABLE "lti_contexts" DROP COLUMN "api_url";--> statement-breakpoint
ALTER TABLE "lti_contexts" DROP COLUMN "members_url";--> statement-breakpoint
ALTER TABLE "lti_contexts" ALTER COLUMN "connection_id" DROP NOT NULL;--> statement-breakpoint
DROP INDEX "identities_kind_provider_subject_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "identities_kind_provider_subject_idx" ON "identities" ("kind","provider","subject") WHERE "kind" <> 'lti';--> statement-breakpoint
CREATE UNIQUE INDEX "lti_contexts_tenant_id_issuer_context_id_idx" ON "lti_contexts" ("tenant_id","issuer","context_id");--> statement-breakpoint
CREATE INDEX "lti_contexts_connection_id_idx" ON "lti_contexts" ("connection_id");--> statement-breakpoint
DELETE FROM "lti_resource_links" AS "later" USING "lti_resource_links" AS "first" WHERE "later"."channel_id" = "first"."channel_id" AND "later"."installation_id" = "first"."installation_id" AND ("later"."created_at", "later"."id") > ("first"."created_at", "first"."id");--> statement-breakpoint
CREATE UNIQUE INDEX "lti_resource_links_channel_id_installation_id_idx" ON "lti_resource_links" ("channel_id","installation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "identities_lti_tenant_subject_idx" ON "identities" ("tenant_id","provider","subject") WHERE "kind" = 'lti';--> statement-breakpoint
ALTER TABLE "identities" ADD CONSTRAINT "identities_tenant_id_tenants_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "lti_contexts" DROP CONSTRAINT "lti_contexts_connection_id_connections_id_fkey", ADD CONSTRAINT "lti_contexts_connection_id_connections_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "connections"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "connections" DROP CONSTRAINT "connections_kind_check", ADD CONSTRAINT "connections_kind_check" CHECK (("kind" = 'sso' AND "federation" IS NOT NULL) OR ("kind" = 'lti' AND "issuer" IS NOT NULL AND ("client_id" IS NOT NULL OR "status" = 'pending')));--> statement-breakpoint
ALTER TABLE "tenants" ALTER COLUMN "restrictions" SET DEFAULT '{"quotas":{"user":1000,"organization":1,"attachment":100,"serviceAccount":20,"apiKey":100,"ltiConnection":3},"rateLimits":{"apiPointsPerHour":1000,"invitationEmailsPerDay":250},"allowUnregisteredClients":true}';