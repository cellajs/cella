-- Hand-ordered: the activity times move from user_counters to the user's actors row before the table goes. user_counters
-- was UNLOGGED, so after a crash it may be empty; whatever it holds is carried over.
ALTER TABLE "actors" ADD COLUMN "last_seen_at" timestamp;--> statement-breakpoint
ALTER TABLE "actors" ADD COLUMN "last_sign_in_at" timestamp;--> statement-breakpoint
UPDATE "actors" SET "last_seen_at" = "user_counters"."last_seen_at", "last_sign_in_at" = "user_counters"."last_sign_in_at" FROM "user_counters" WHERE "user_counters"."user_id" = "actors"."id";--> statement-breakpoint
DROP TABLE "user_counters";--> statement-breakpoint
ALTER TABLE "connections" DROP COLUMN "client_id";--> statement-breakpoint
ALTER TABLE "connections" DROP COLUMN "deployment_id";--> statement-breakpoint
ALTER TABLE "product_counters" DROP COLUMN "last_viewed_at";--> statement-breakpoint
ALTER TABLE "tenants" DROP COLUMN "subscription_data";--> statement-breakpoint
-- Hand-added: every emails row is a proven inbox, so verified_at becomes the proof. A row no proof ever wrote cannot
-- stay a magic-link sign-in identifier and goes; a proven row without its time takes the latest proof's, else its
-- creation time.
DELETE FROM "emails" WHERE "verified" = false;--> statement-breakpoint
UPDATE "emails" SET "verified_at" = coalesce("last_verified_at", "created_at") WHERE "verified_at" IS NULL;--> statement-breakpoint
ALTER TABLE "emails" DROP COLUMN "verified";--> statement-breakpoint
ALTER TABLE "emails" ALTER COLUMN "verified_at" SET NOT NULL;
