ALTER TABLE "passkeys" ADD COLUMN "transports" varchar(255)[];--> statement-breakpoint
ALTER TABLE "passkeys" ALTER COLUMN "counter" SET DATA TYPE bigint USING "counter"::bigint;--> statement-breakpoint
DROP INDEX "totps_user_id_idx";--> statement-breakpoint
-- Hand-added: an account holding several authenticator apps from concurrent setups keeps its newest, so the unique index builds.
DELETE FROM "totps" AS "older" USING "totps" AS "newer" WHERE "older"."user_id" = "newer"."user_id" AND "older"."id" < "newer"."id";--> statement-breakpoint
CREATE UNIQUE INDEX "totps_user_id_idx" ON "totps" ("user_id");