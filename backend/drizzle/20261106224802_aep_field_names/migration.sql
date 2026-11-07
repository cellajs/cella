ALTER TABLE "organizations" RENAME COLUMN "country" TO "region_code";--> statement-breakpoint
ALTER TABLE "organizations" RENAME COLUMN "timezone" TO "time_zone";--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "first_name" TO "given_name";--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "last_name" TO "family_name";--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "language" TO "language_code";