-- In the generated migration, the issuer of a context comes from its connection: in place of
-- `ALTER TABLE "lti_contexts" ADD COLUMN "issuer" varchar(255) NOT NULL;`
ALTER TABLE "lti_contexts" ADD COLUMN "issuer" varchar(255);--> statement-breakpoint
UPDATE "lti_contexts" SET "issuer" = "connections"."issuer" FROM "connections" WHERE "connections"."id" = "lti_contexts"."connection_id";--> statement-breakpoint
ALTER TABLE "lti_contexts" ALTER COLUMN "issuer" SET NOT NULL;--> statement-breakpoint

-- Right after it, before `CREATE UNIQUE INDEX "lti_contexts_tenant_id_issuer_context_id_idx"`: two connections of one
-- tenant and issuer that both launched a course left two rows. The oldest, which holds the first channel, stays.
DELETE FROM "lti_contexts" AS "later" USING "lti_contexts" AS "first" WHERE "later"."tenant_id" = "first"."tenant_id" AND "later"."issuer" = "first"."issuer" AND "later"."context_id" = "first"."context_id" AND ("later"."created_at", "later"."id") > ("first"."created_at", "first"."id");--> statement-breakpoint

-- In the generated migration, right after `ALTER TABLE "identities" ADD COLUMN "tenant_id" varchar(24);`: an LTI identity
-- belongs to the tenant of the connection it came through last. One whose connection is gone keeps none and is found no more.
UPDATE "identities" SET "tenant_id" = "connections"."tenant_id" FROM "connections" WHERE "identities"."kind" = 'lti' AND "connections"."id" = "identities"."connection_id";--> statement-breakpoint

-- In the generated migration, right before `CREATE UNIQUE INDEX "lti_resource_links_channel_id_installation_id_idx"`: a
-- channel keeps its first tab of each LTI tool.
DELETE FROM "lti_resource_links" AS "later" USING "lti_resource_links" AS "first" WHERE "later"."channel_id" = "first"."channel_id" AND "later"."installation_id" = "first"."installation_id" AND ("later"."created_at", "later"."id") > ("first"."created_at", "first"."id");--> statement-breakpoint
