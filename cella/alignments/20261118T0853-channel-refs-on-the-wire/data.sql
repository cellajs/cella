-- Rows written before the fan-out stored a default context take their subject, so the column can go not null.
UPDATE "notifications" SET "context_id" = "subject_id" WHERE "context_id" IS NULL;--> statement-breakpoint
