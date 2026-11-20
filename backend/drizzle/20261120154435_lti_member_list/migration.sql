CREATE TABLE "lti_context_memberships" (
	"context_id" uuid,
	"membership_id" uuid,
	"listed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone,
	"updated_by" uuid,
	CONSTRAINT "lti_context_memberships_pkey" PRIMARY KEY("context_id","membership_id")
);
--> statement-breakpoint
CREATE INDEX "lti_context_memberships_membership_id_idx" ON "lti_context_memberships" ("membership_id");--> statement-breakpoint
ALTER TABLE "lti_context_memberships" ADD CONSTRAINT "lti_context_memberships_context_id_lti_contexts_id_fkey" FOREIGN KEY ("context_id") REFERENCES "lti_contexts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "lti_context_memberships" ADD CONSTRAINT "lti_context_memberships_membership_id_memberships_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "lti_context_memberships" ADD CONSTRAINT "lti_context_memberships_created_by_actors_id_fkey" FOREIGN KEY ("created_by") REFERENCES "actors"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "lti_context_memberships" ADD CONSTRAINT "lti_context_memberships_updated_by_actors_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "actors"("id") ON DELETE SET NULL;--> statement-breakpoint

-- At the end of the generated migration, after the foreign keys of "lti_context_memberships": a membership an LTI
-- member import made before the upgrade is recorded as held by a list. Its writer is the service account of a
-- context's connection and its channel is that context's channel. It is recorded under every such context.
INSERT INTO "lti_context_memberships" ("context_id", "membership_id", "listed", "created_by") SELECT "lti_contexts"."id", "memberships"."id", true, "memberships"."created_by" FROM "lti_contexts" JOIN "service_accounts" ON "service_accounts"."connection_id" = "lti_contexts"."connection_id" JOIN "memberships" ON "memberships"."created_by" = "service_accounts"."id" AND "memberships"."channel_id" = "lti_contexts"."channel_id" ON CONFLICT DO NOTHING;--> statement-breakpoint

-- Right after it: the seat the same import made beside a membership in a channel below the organization.
INSERT INTO "lti_context_memberships" ("context_id", "membership_id", "listed", "created_by") SELECT "held"."context_id", "seat"."id", true, "seat"."created_by" FROM "lti_context_memberships" AS "held" JOIN "lti_contexts" ON "lti_contexts"."id" = "held"."context_id" AND "lti_contexts"."channel_type" <> 'organization' JOIN "memberships" ON "memberships"."id" = "held"."membership_id" JOIN "memberships" AS "seat" ON "seat"."user_id" = "memberships"."user_id" AND "seat"."channel_id" = "lti_contexts"."organization_id" AND "seat"."created_by" = "memberships"."created_by" ON CONFLICT DO NOTHING;
