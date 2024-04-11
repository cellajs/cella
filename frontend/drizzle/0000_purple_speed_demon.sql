CREATE TABLE IF NOT EXISTS "projects" (
	"id" varchar PRIMARY KEY NOT NULL,
	"organization_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"description" varchar,
	"created_at" timestamp NOT NULL,
	"created_by" varchar NOT NULL,
	"modified_at" timestamp,
	"modified_by" varchar
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tasks" (
	"id" varchar PRIMARY KEY NOT NULL,
	"project_id" varchar NOT NULL REFERENCES "projects" ("id") ON DELETE CASCADE,
	"name" varchar NOT NULL,
	"description" varchar,
	"created_at" timestamp NOT NULL,
	"created_by" varchar NOT NULL,
	"modified_at" timestamp,
	"modified_by" varchar
);
