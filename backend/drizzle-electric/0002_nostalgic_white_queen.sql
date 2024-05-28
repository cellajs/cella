ALTER TABLE "labels" ADD COLUMN "organization_id" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "labels" ADD COLUMN "workspace_id" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "organization_id" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "workspace_id" varchar NOT NULL;