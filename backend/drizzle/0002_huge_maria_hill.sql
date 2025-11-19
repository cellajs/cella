ALTER TABLE "inactive_memberships" ADD COLUMN "unique_key" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "unique_key" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "inactive_memberships" ADD CONSTRAINT "inactive_memberships_uniqueKey_unique" UNIQUE("unique_key");--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_uniqueKey_unique" UNIQUE("unique_key");