CREATE TABLE IF NOT EXISTS "task_labels" (
	"task_id" uuid NOT NULL REFERENCES "tasks"("id") ON DELETE cascade,
	"label_id" uuid NOT NULL REFERENCES "labels"("id") ON DELETE cascade,
	CONSTRAINT "task_labels_label_id_task_id_pk" PRIMARY KEY("label_id","task_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_users" (
	"task_id" uuid NOT NULL REFERENCES "tasks"("id") ON DELETE cascade,
	"user_id" uuid NOT NULL,
	"role" varchar NOT NULL,
	CONSTRAINT "task_users_user_id_task_id_pk" PRIMARY KEY("user_id","task_id")
);
