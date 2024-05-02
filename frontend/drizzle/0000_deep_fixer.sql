CREATE TABLE IF NOT EXISTS "projects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" varchar NOT NULL,
	"name" varchar NOT NULL,
	"color" varchar NOT NULL,
	"workspace_id" varchar NOT NULL,
	"created_at" timestamp NOT NULL,
	"created_by" varchar NOT NULL,
	"modified_at" timestamp,
	"modified_by" varchar
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" varchar NOT NULL,
	"markdown" varchar,
	"summary" varchar NOT NULL,
	"type" varchar NOT NULL,
	"impact" integer,
	"status" integer NOT NULL,
	"project_id" uuid NOT NULL REFERENCES "projects" ("id") ON DELETE CASCADE,
	"created_at" timestamp NOT NULL,
	"created_by" varchar NOT NULL,
	"assigned_by" varchar,
	"assigned_at" timestamp,
	"modified_at" timestamp,
	"modified_by" varchar
);
