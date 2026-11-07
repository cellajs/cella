ALTER TABLE "sessions" RENAME COLUMN "type" TO "kind";--> statement-breakpoint
ALTER TABLE "tokens" RENAME COLUMN "type" TO "kind";--> statement-breakpoint
ALTER TABLE "notifications" RENAME COLUMN "type" TO "kind";--> statement-breakpoint
ALTER TABLE "requests" RENAME COLUMN "type" TO "kind";--> statement-breakpoint
ALTER INDEX "tokens_secret_type_idx" RENAME TO "tokens_secret_kind_idx";--> statement-breakpoint
ALTER INDEX "requests_unique_signup_email_type" RENAME TO "requests_unique_signup_email_kind";--> statement-breakpoint
DROP INDEX "requests_unique_signup_email_kind";--> statement-breakpoint
CREATE UNIQUE INDEX "requests_unique_signup_email_kind" ON "requests" (lower("email"),"kind") WHERE "kind" in ('waitlist', 'newsletter');--> statement-breakpoint
DROP INDEX "tokens_step_up_session_id_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "tokens_step_up_session_id_idx" ON "tokens" ("session_id") WHERE "kind" = 'step-up';