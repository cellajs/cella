ALTER TABLE "requests" ADD COLUMN "invited_at" timestamp;--> statement-breakpoint
-- Hand-added: a request an invitation went out for stays invited. Its time is the token's while that row still
-- exists, else the request's own.
UPDATE "requests" SET "invited_at" = coalesce((SELECT "tokens"."created_at" FROM "tokens" WHERE "tokens"."id" = "requests"."token_id"), "requests"."created_at") WHERE "requests"."token_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "requests" DROP COLUMN "token_id";--> statement-breakpoint
ALTER TABLE "inactive_memberships" DROP COLUMN "token_id";
