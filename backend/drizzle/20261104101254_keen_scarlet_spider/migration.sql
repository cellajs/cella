ALTER TABLE "yjs_documents" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
-- Every write sets last_seen_at; a row from before that reads as seen at its creation, as the retention sweep counted it.
UPDATE "push_subscriptions" SET "last_seen_at" = "created_at" WHERE "last_seen_at" IS NULL;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ALTER COLUMN "last_seen_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "yjs_updates" ALTER COLUMN "organization_id" SET NOT NULL;