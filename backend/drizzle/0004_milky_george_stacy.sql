DROP INDEX IF EXISTS "organizations_name_index";--> statement-breakpoint
DROP INDEX IF EXISTS "organizations_created_at_index";--> statement-breakpoint
DROP INDEX IF EXISTS "requests_emails";--> statement-breakpoint
DROP INDEX IF EXISTS "requests_created_at";--> statement-breakpoint
DROP INDEX IF EXISTS "users_name_index";--> statement-breakpoint
DROP INDEX IF EXISTS "users_email_index";--> statement-breakpoint
DROP INDEX IF EXISTS "users_created_at_index";--> statement-breakpoint
DROP INDEX IF EXISTS "workspace_name_index";--> statement-breakpoint
DROP INDEX IF EXISTS "workspace_created_at_index";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organizations_name_index" ON "organizations" USING btree (name DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organizations_created_at_index" ON "organizations" USING btree (created_at DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "requests_emails" ON "requests" USING btree (email DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "requests_created_at" ON "requests" USING btree (created_at DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_name_index" ON "users" USING btree (name DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_email_index" ON "users" USING btree (email DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_created_at_index" ON "users" USING btree (created_at DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspace_name_index" ON "workspaces" USING btree (name DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspace_created_at_index" ON "workspaces" USING btree (created_at DESC NULLS LAST);