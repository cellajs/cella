-- After the generated statements: the table rename, the column renames, the new columns and indexes.

-- Postgres keeps the derived constraint names through a table rename; name them as drizzle derives them now.
ALTER TABLE "invitations" RENAME CONSTRAINT "inactive_memberships_pkey" TO "invitations_pkey";--> statement-breakpoint
ALTER TABLE "invitations" RENAME CONSTRAINT "inactive_memberships_tenant_id_tenants_id_fkey" TO "invitations_tenant_id_tenants_id_fkey";--> statement-breakpoint
ALTER TABLE "invitations" RENAME CONSTRAINT "inactive_memberships_user_id_users_id_fkey" TO "invitations_user_id_users_id_fkey";--> statement-breakpoint
ALTER TABLE "invitations" RENAME CONSTRAINT "inactive_memberships_created_by_users_id_fkey" TO "invitations_created_by_users_id_fkey";--> statement-breakpoint
ALTER TABLE "invitations" RENAME CONSTRAINT "inactive_memberships_gmmCA2ACknk4_fkey" TO "invitations_Yt9Bq6Kr3lB9_fkey";--> statement-breakpoint
ALTER TABLE "tokens" RENAME CONSTRAINT "tokens_inactive_membership_id_inactive_memberships_id_fkey" TO "tokens_inactive_membership_id_invitations_id_fkey";--> statement-breakpoint
ALTER TABLE "tokens" RENAME CONSTRAINT "tokens_followed_invitation_id_inactive_memberships_id_fkey" TO "tokens_followed_invitation_id_invitations_id_fkey";--> statement-breakpoint

-- The rename keeps the old immutability trigger; the side-effect migration installs invitations_immutable_keys_trigger.
DROP TRIGGER IF EXISTS "inactive_memberships_immutable_keys_trigger" ON "invitations";--> statement-breakpoint
DROP FUNCTION IF EXISTS inactive_membership_immutable_keys();--> statement-breakpoint

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
