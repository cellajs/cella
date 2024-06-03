CREATE TABLE IF NOT EXISTS "labels" (
	"id" varchar PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"color" varchar,
	"organization_id" varchar NOT NULL,
	"project_id" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tasks" (
	"id" varchar PRIMARY KEY NOT NULL,
	"slug" varchar NOT NULL,
	"markdown" varchar,
	"summary" varchar NOT NULL,
	"type" varchar NOT NULL,
	"impact" integer,
	"sort_order" integer,
	"status" integer NOT NULL,
	"parent_id" varchar,
	"labels" jsonb,
	"assigned_to" jsonb,
	"organization_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"created_at" timestamp NOT NULL,
	"created_by" varchar NOT NULL,
	"assigned_by" varchar,
	"assigned_at" timestamp,
	"modified_at" timestamp,
	"modified_by" varchar,
	CONSTRAINT "tasks_parent_id_tasks_id_fk" FOREIGN KEY ("parent_id") REFERENCES "tasks"("id") ON DELETE no action ON UPDATE no action
);
