-- Above the generated `ALTER TABLE "push_subscriptions" ALTER COLUMN "last_seen_at" SET NOT NULL`: a row from before every write set the column reads as seen at its creation, as the retention sweep counted it.
UPDATE "push_subscriptions" SET "last_seen_at" = "created_at" WHERE "last_seen_at" IS NULL;--> statement-breakpoint
