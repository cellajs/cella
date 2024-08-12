CREATE TABLE IF NOT EXISTS "labels" (
	"id" varchar PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"color" varchar,
	"organization_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"last_used" timestamp NOT NULL,
	"use_count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tasks" (
	"id" varchar PRIMARY KEY NOT NULL,
	"slug" varchar NOT NULL,
	"description" varchar,
	"summary" varchar NOT NULL,
	"type" varchar NOT NULL,
	"impact" integer,
	"sort_order" double precision NOT NULL,
	"status" integer NOT NULL,
	"parent_id" varchar,
	"labels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"assigned_to" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"organization_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" varchar NOT NULL,
	"modified_at" timestamp,
	"modified_by" varchar
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_id_tasks_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tasks_description" ON "tasks" USING btree ("description");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tasks_project" ON "tasks" USING btree ("project_id");