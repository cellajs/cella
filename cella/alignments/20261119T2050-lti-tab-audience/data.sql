-- In the generated migration, right after `ALTER TABLE "lti_installations" ADD COLUMN "channel_types" ...`: an LTI tool
-- may get tabs in the channel types it has tabs in today, on or off. Nothing else is allowed until an admin allows it.
UPDATE "lti_installations" SET "channel_types" = "placed"."channel_types" FROM (SELECT "installation_id", jsonb_agg(DISTINCT "channel_type") AS "channel_types" FROM "lti_resource_links" GROUP BY "installation_id") AS "placed" WHERE "placed"."installation_id" = "lti_installations"."service_account_id";--> statement-breakpoint

-- At the end of the generated migration, only where `ltiContextTypes` makes no context of a channel type that holds tabs
-- today, such as a course section below a course, with your own types in the list: those tabs stop launching and no
-- longer let the LTI tool read the channel above, and a channel's Tabs card lists none. The statement switches them off
-- so the LTI tools card shows them off; it keeps every resource link and its id, and deletes nothing.
-- UPDATE "lti_resource_links" SET "enabled" = false WHERE "channel_type" IN ('courseSection');--> statement-breakpoint
