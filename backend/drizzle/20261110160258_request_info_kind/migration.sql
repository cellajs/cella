DROP INDEX "requests_unique_signup_email_kind";--> statement-breakpoint
UPDATE "requests" SET "kind" = 'info' WHERE "kind" = 'newsletter';--> statement-breakpoint
CREATE UNIQUE INDEX "requests_unique_signup_email_kind" ON "requests" (lower("email"),"kind") WHERE "kind" in ('waitlist', 'info');
