-- A session holding several step-up codes from concurrent requests keeps its newest, so the unique index builds.
DELETE FROM "tokens" AS "older" USING "tokens" AS "newer" WHERE "older"."type" = 'step-up' AND "newer"."type" = 'step-up' AND "older"."session_id" = "newer"."session_id" AND "older"."id" < "newer"."id";--> statement-breakpoint
