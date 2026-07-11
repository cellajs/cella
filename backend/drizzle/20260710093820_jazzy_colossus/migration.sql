ALTER TABLE "inactive_memberships" ADD COLUMN "reminded_at" timestamp;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "published_at" timestamp DEFAULT now();