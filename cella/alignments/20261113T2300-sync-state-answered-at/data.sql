-- After the ADD COLUMN of "answered_at" and before the DROP COLUMN of "verified_at" and "rebuilt_at": the last answer stays.
UPDATE "sync_state" SET "answered_at" = GREATEST("verified_at", "rebuilt_at");--> statement-breakpoint
