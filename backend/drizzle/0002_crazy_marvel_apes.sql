DROP INDEX IF EXISTS "organizations_name_index";
--> statement-breakpoint
DROP INDEX IF EXISTS "users_name_index";
--> statement-breakpoint
DROP INDEX IF EXISTS "users_email_index";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organizations_created_at_index" ON "organizations" ("created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_created_at_index" ON "users" ("created_at" DESC);