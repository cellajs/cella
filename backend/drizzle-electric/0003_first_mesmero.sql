CREATE INDEX IF NOT EXISTS "idx_tasks_markdown" ON "tasks" USING btree ("markdown");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tasks_project" ON "tasks" USING btree ("project_id");