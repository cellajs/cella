-- Data moves that must precede the schema changes below.
-- No app retired a signing key; a row that says so would block the unique index on status, which no longer filters.
DELETE FROM "signing_keys" WHERE "status" NOT IN ('current', 'next');--> statement-breakpoint
-- A verified identity without a stamp keeps its verification before the boolean goes.
UPDATE "identities" SET "verified_at" = "created_at" WHERE "verified" AND "verified_at" IS NULL;--> statement-breakpoint
-- A tenant an organization deletion archived keeps its place in the removal sweep under the new status.
UPDATE "tenants" SET "status" = 'deleted' WHERE "status" = 'archived';--> statement-breakpoint
ALTER TABLE "inactive_memberships" RENAME TO "invitations";--> statement-breakpoint
ALTER TABLE "devices" RENAME COLUMN "first_seen_at" TO "created_at";--> statement-breakpoint
ALTER TABLE "devices" RENAME COLUMN "last_seen_at" TO "last_sign_in_at";--> statement-breakpoint
ALTER TABLE "devices" RENAME COLUMN "notified_at" TO "mailed_at";--> statement-breakpoint
ALTER TABLE "identities" RENAME COLUMN "last_used_at" TO "last_sign_in_at";--> statement-breakpoint
ALTER TABLE "tokens" RENAME COLUMN "inactive_membership_id" TO "invitation_id";--> statement-breakpoint
ALTER TABLE "tokens" RENAME COLUMN "invoked_at" TO "redeemed_at";--> statement-breakpoint
ALTER TABLE "invitations" RENAME COLUMN "reminded_at" TO "mailed_at";--> statement-breakpoint
ALTER TABLE "notifications" RENAME COLUMN "emailed_at" TO "mailed_at";--> statement-breakpoint
ALTER TABLE "requests" RENAME COLUMN "invited_at" TO "mailed_at";--> statement-breakpoint
ALTER INDEX "devices_user_id_notified_at_idx" RENAME TO "devices_user_id_mailed_at_idx";--> statement-breakpoint
ALTER INDEX "devices_last_seen_at_idx" RENAME TO "devices_last_sign_in_at_idx";--> statement-breakpoint
ALTER INDEX "tokens_inactive_membership_id_idx" RENAME TO "tokens_invitation_id_idx";--> statement-breakpoint
ALTER INDEX "inactive_memberships_user_id_idx" RENAME TO "invitations_user_id_idx";--> statement-breakpoint
ALTER INDEX "inactive_memberships_created_by_idx" RENAME TO "invitations_created_by_idx";--> statement-breakpoint
ALTER INDEX "inactive_memberships_tenant_id_idx" RENAME TO "invitations_tenant_id_idx";--> statement-breakpoint
ALTER INDEX "inactive_memberships_email_idx" RENAME TO "invitations_email_idx";--> statement-breakpoint
DROP INDEX "inactive_memberships_org_pending_idx";--> statement-breakpoint
DROP INDEX "signing_keys_status_idx";--> statement-breakpoint
ALTER TABLE "sync_state" ADD COLUMN "answered_at" timestamp with time zone;--> statement-breakpoint
-- The last answer stays before the two stamps it replaces go.
UPDATE "sync_state" SET "answered_at" = GREATEST("verified_at", "rebuilt_at");--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "status" varchar DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "status_changed_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "identities" DROP COLUMN "verified";--> statement-breakpoint
ALTER TABLE "sync_state" DROP COLUMN "verified_at";--> statement-breakpoint
ALTER TABLE "sync_state" DROP COLUMN "rebuilt_at";--> statement-breakpoint
ALTER TABLE "system_roles" DROP COLUMN "updated_at";--> statement-breakpoint
ALTER TABLE "push_subscriptions" DROP COLUMN "expiration_time";--> statement-breakpoint
ALTER TABLE "signing_keys" DROP COLUMN "retired_at";--> statement-breakpoint
ALTER TABLE "devices" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
DROP INDEX "signing_keys_one_per_status_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "signing_keys_one_per_status_idx" ON "signing_keys" ("status");--> statement-breakpoint
DROP INDEX "tokens_invitation_id_idx";--> statement-breakpoint
CREATE INDEX "tokens_invitation_id_idx" ON "tokens" ("invitation_id") WHERE "invitation_id" is not null;--> statement-breakpoint
ALTER TABLE "invitations" RENAME CONSTRAINT "inactive_memberships_tenant_email_ctx" TO "invitations_tenant_email_ctx";--> statement-breakpoint
CREATE INDEX "invitations_org_status_idx" ON "invitations" ("organization_id","status");--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_updated_by_actors_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "actors"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_created_by_actors_id_fkey" FOREIGN KEY ("created_by") REFERENCES "actors"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_updated_by_actors_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "actors"("id") ON DELETE SET NULL;--> statement-breakpoint
-- A revoked row without a reason reads as signed out, and a reason on a row never revoked goes.
UPDATE "sessions" SET "revocation_reason" = 'sign_out' WHERE "revoked_at" IS NOT NULL AND "revocation_reason" IS NULL;--> statement-breakpoint
UPDATE "sessions" SET "revocation_reason" = NULL WHERE "revoked_at" IS NULL AND "revocation_reason" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_revocation_reason_check" CHECK (("revoked_at" IS NULL) = ("revocation_reason" IS NULL));--> statement-breakpoint
-- Postgres keeps the derived constraint names through a table rename; name them as drizzle derives them now.
ALTER TABLE "invitations" RENAME CONSTRAINT "inactive_memberships_pkey" TO "invitations_pkey";--> statement-breakpoint
ALTER TABLE "invitations" RENAME CONSTRAINT "inactive_memberships_tenant_id_tenants_id_fkey" TO "invitations_tenant_id_tenants_id_fkey";--> statement-breakpoint
ALTER TABLE "invitations" RENAME CONSTRAINT "inactive_memberships_user_id_users_id_fkey" TO "invitations_user_id_users_id_fkey";--> statement-breakpoint
ALTER TABLE "invitations" RENAME CONSTRAINT "inactive_memberships_created_by_users_id_fkey" TO "invitations_created_by_users_id_fkey";--> statement-breakpoint
ALTER TABLE "invitations" RENAME CONSTRAINT "inactive_memberships_gmmCA2ACknk4_fkey" TO "invitations_Yt9Bq6Kr3lB9_fkey";--> statement-breakpoint
ALTER TABLE "tokens" RENAME CONSTRAINT "tokens_inactive_membership_id_inactive_memberships_id_fkey" TO "tokens_invitation_id_invitations_id_fkey";--> statement-breakpoint
ALTER TABLE "tokens" RENAME CONSTRAINT "tokens_followed_invitation_id_inactive_memberships_id_fkey" TO "tokens_followed_invitation_id_invitations_id_fkey";--> statement-breakpoint

-- The rename keeps the old immutability trigger; the side-effect migration installs invitations_immutable_keys_trigger.
DROP TRIGGER IF EXISTS "inactive_memberships_immutable_keys_trigger" ON "invitations";--> statement-breakpoint
DROP FUNCTION IF EXISTS inactive_membership_immutable_keys();--> statement-breakpoint

-- The resource type `inactive_membership` is `invitation`. Activities are append-only, so the trigger steps aside.
ALTER TABLE "activities" DISABLE TRIGGER "activities_immutable_keys_trigger";--> statement-breakpoint
UPDATE "activities"
SET "resource_type" = 'invitation', "type" = replace("type", 'inactive_membership.', 'invitation.'), "table_name" = 'invitations'
WHERE "resource_type" = 'inactive_membership';--> statement-breakpoint
ALTER TABLE "activities" ENABLE TRIGGER "activities_immutable_keys_trigger";--> statement-breakpoint

-- A declined invitation is declined since its decline; any other is pending since its creation.
UPDATE "invitations"
SET "status" = CASE WHEN "declined_at" IS NOT NULL THEN 'declined' ELSE 'pending' END,
  "status_changed_at" = coalesce("declined_at", "created_at");--> statement-breakpoint

-- Held: never mailed, to a channel still a draft. One statement per channel table with drafts; the template has one.
UPDATE "invitations" i
SET "status" = 'held'
FROM "organizations" c
WHERE i."channel_type" = 'organization' AND i."channel_id" = c."id" AND c."published_at" IS NULL
  AND i."status" = 'pending' AND i."mailed_at" IS NULL;
