ALTER TABLE "lti_installations" ADD COLUMN "channel_types" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
UPDATE "lti_installations" SET "channel_types" = "placed"."channel_types" FROM (SELECT "installation_id", jsonb_agg(DISTINCT "channel_type") AS "channel_types" FROM "lti_resource_links" GROUP BY "installation_id") AS "placed" WHERE "placed"."installation_id" = "lti_installations"."service_account_id";--> statement-breakpoint
ALTER TABLE "lti_resource_links" ADD COLUMN "audience" varchar DEFAULT 'members' NOT NULL;
