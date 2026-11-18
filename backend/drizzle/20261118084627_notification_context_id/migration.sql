UPDATE "notifications" SET "context_id" = "subject_id" WHERE "context_id" IS NULL;--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "context_id" SET NOT NULL;