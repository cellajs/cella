ALTER TABLE "lti_contexts" ADD COLUMN "api_url" varchar(2048);--> statement-breakpoint
ALTER TABLE "lti_contexts" ADD COLUMN "members_url" varchar(2048);--> statement-breakpoint
ALTER TABLE "lti_contexts" ADD COLUMN "import_ran_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lti_contexts" ADD COLUMN "import_read_count" integer;--> statement-breakpoint
ALTER TABLE "lti_contexts" ADD COLUMN "import_issue" varchar;--> statement-breakpoint
ALTER TABLE "service_accounts" ADD COLUMN "connection_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "service_accounts_connection_id_idx" ON "service_accounts" ("connection_id");--> statement-breakpoint
ALTER TABLE "service_accounts" ADD CONSTRAINT "service_accounts_connection_id_connections_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "connections"("id") ON DELETE CASCADE;