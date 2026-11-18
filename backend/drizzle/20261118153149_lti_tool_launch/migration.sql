CREATE TABLE "lti_contexts" (
	"id" uuid PRIMARY KEY,
	"tenant_id" varchar(24) NOT NULL,
	"organization_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"context_id" varchar(255) NOT NULL,
	"label" varchar(255),
	"title" varchar(255),
	"types" varchar(255)[] DEFAULT '{}'::varchar(255)[] NOT NULL,
	"channel_type" varchar NOT NULL,
	"channel_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE UNIQUE INDEX "lti_contexts_connection_id_context_id_idx" ON "lti_contexts" ("connection_id","context_id");--> statement-breakpoint
CREATE INDEX "lti_contexts_channel_id_idx" ON "lti_contexts" ("channel_id");--> statement-breakpoint
ALTER TABLE "lti_contexts" ADD CONSTRAINT "lti_contexts_tenant_id_tenants_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id");--> statement-breakpoint
ALTER TABLE "lti_contexts" ADD CONSTRAINT "lti_contexts_connection_id_connections_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "connections"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "lti_contexts" ADD CONSTRAINT "lti_contexts_created_by_actors_id_fkey" FOREIGN KEY ("created_by") REFERENCES "actors"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "lti_contexts" ADD CONSTRAINT "lti_contexts_updated_by_actors_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "actors"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "lti_contexts" ADD CONSTRAINT "lti_contexts_GWuG77TCefJB_fkey" FOREIGN KEY ("tenant_id","organization_id") REFERENCES "organizations"("tenant_id","id") ON DELETE CASCADE;