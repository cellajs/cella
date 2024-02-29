CREATE INDEX IF NOT EXISTS "organizations_name_index" ON "organizations" ("name" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_name_index" ON "users" ("name" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_email_index" ON "users" ("email" DESC);