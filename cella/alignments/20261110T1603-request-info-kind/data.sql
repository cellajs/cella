-- Between the generated DROP INDEX and CREATE UNIQUE INDEX of "requests_unique_signup_email_kind".
UPDATE "requests" SET "kind" = 'info' WHERE "kind" = 'newsletter';--> statement-breakpoint
