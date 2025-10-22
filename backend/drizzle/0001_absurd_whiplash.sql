ALTER TABLE "memberships" DROP CONSTRAINT "memberships_token_id_tokens_id_fk";
--> statement-breakpoint
ALTER TABLE "memberships" DROP COLUMN "token_id";