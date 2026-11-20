CREATE TABLE "lti_context_memberships" (
	"context_id" uuid,
	"membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone,
	"updated_by" uuid,
	CONSTRAINT "lti_context_memberships_pkey" PRIMARY KEY("context_id","membership_id")
);
--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "refused_by_platform" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "lti_context_memberships_membership_id_idx" ON "lti_context_memberships" ("membership_id");--> statement-breakpoint
ALTER TABLE "lti_context_memberships" ADD CONSTRAINT "lti_context_memberships_context_id_lti_contexts_id_fkey" FOREIGN KEY ("context_id") REFERENCES "lti_contexts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "lti_context_memberships" ADD CONSTRAINT "lti_context_memberships_membership_id_memberships_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "lti_context_memberships" ADD CONSTRAINT "lti_context_memberships_created_by_actors_id_fkey" FOREIGN KEY ("created_by") REFERENCES "actors"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "lti_context_memberships" ADD CONSTRAINT "lti_context_memberships_updated_by_actors_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "actors"("id") ON DELETE SET NULL;