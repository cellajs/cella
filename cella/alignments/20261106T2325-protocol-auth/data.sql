-- An account holding several authenticator apps from concurrent setups keeps its newest, so the unique index builds.
DELETE FROM "totps" AS "older" USING "totps" AS "newer" WHERE "older"."user_id" = "newer"."user_id" AND "older"."id" < "newer"."id";--> statement-breakpoint
