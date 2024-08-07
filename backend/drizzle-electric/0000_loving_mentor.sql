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
	"labels" jsonb NOT NULL,
	"assigned_to" jsonb NOT NULL,
	"organization_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"created_at" timestamp NOT NULL,
	"created_by" varchar NOT NULL,
	"modified_at" timestamp,
	"modified_by" varchar
);
--> statement-breakpoint
ALTER TABLE "tasks" ENABLE ELECTRIC;
--> statement-breakpoint
ALTER TABLE "labels" ENABLE ELECTRIC;