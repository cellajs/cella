CREATE TABLE IF NOT EXISTS "access_requests" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar,
	"organization_id" varchar,
	"email" varchar NOT NULL,
	"type" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "access_requests_email_index" ON "access_requests" ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "access_requests_created_at_index" ON "access_requests" ("created_at");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
