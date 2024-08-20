ALTER TABLE "tasks" ADD COLUMN "keywords" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "expandable" boolean DEFAULT false;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tasks_keywords" ON "tasks" USING btree ("keywords");