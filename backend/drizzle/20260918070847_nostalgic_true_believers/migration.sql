ALTER TABLE "emails" ADD COLUMN "last_verified_by" varchar(255);--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "last_verified_at" timestamp;--> statement-breakpoint
UPDATE "emails" SET "last_verified_by" = 'magic', "last_verified_at" = "verified_at" WHERE "verified" = true AND "verified_at" IS NOT NULL;
