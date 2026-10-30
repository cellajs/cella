-- Hand-added: a session holding several step-up codes from concurrent requests keeps its newest, so the index builds.
DELETE FROM "tokens" AS "older" USING "tokens" AS "newer" WHERE "older"."type" = 'step-up' AND "newer"."type" = 'step-up' AND "older"."session_id" = "newer"."session_id" AND "older"."id" < "newer"."id";--> statement-breakpoint
CREATE UNIQUE INDEX "tokens_step_up_session_id_idx" ON "tokens" ("session_id") WHERE "type" = 'step-up';
