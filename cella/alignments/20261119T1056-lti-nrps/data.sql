-- In the generated migration, the issuer of a context comes from its connection: in place of
-- `ALTER TABLE "lti_contexts" ADD COLUMN "issuer" varchar(255) NOT NULL;`
ALTER TABLE "lti_contexts" ADD COLUMN "issuer" varchar(255);--> statement-breakpoint
UPDATE "lti_contexts" SET "issuer" = "connections"."issuer" FROM "connections" WHERE "connections"."id" = "lti_contexts"."connection_id";--> statement-breakpoint
ALTER TABLE "lti_contexts" ALTER COLUMN "issuer" SET NOT NULL;--> statement-breakpoint

-- In the generated migration, right after `ALTER TABLE "identities" ADD COLUMN "tenant_id" varchar(24);`: an LTI identity
-- belongs to the tenant of the connection it came through last. One whose connection is gone keeps none and is found no more.
UPDATE "identities" SET "tenant_id" = "connections"."tenant_id" FROM "connections" WHERE "identities"."kind" = 'lti' AND "connections"."id" = "identities"."connection_id";--> statement-breakpoint
