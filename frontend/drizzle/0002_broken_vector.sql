CREATE TABLE IF NOT EXISTS "labels" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"color" varchar,
	"project_id" uuid NOT NULL REFERENCES "projects" ("id") ON DELETE CASCADE
);
