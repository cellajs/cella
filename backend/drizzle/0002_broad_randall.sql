ALTER TABLE "memberships" ALTER COLUMN "type" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "memberships" ALTER COLUMN "inactive" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ALTER COLUMN "muted" SET NOT NULL;