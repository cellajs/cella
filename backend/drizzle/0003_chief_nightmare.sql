ALTER TABLE "tasks" ALTER COLUMN "created_by" SET DEFAULT 'unknown';--> statement-breakpoint
ALTER TABLE "labels" ADD COLUMN "entity" varchar DEFAULT 'label' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "entity" varchar DEFAULT 'task' NOT NULL;