ALTER TABLE "lti_contexts" ADD COLUMN "memberships_url" varchar(2048);--> statement-breakpoint
ALTER TABLE "lti_contexts" DROP COLUMN "api_url";--> statement-breakpoint
ALTER TABLE "lti_contexts" DROP COLUMN "members_url";