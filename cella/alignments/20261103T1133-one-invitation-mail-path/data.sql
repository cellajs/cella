-- Above the generated statements: a token whose invitation row is gone would refuse the foreign key, and it opens nothing, so it goes.
DELETE FROM "tokens" WHERE "inactive_membership_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "inactive_memberships" WHERE "inactive_memberships"."id" = "tokens"."inactive_membership_id");--> statement-breakpoint
