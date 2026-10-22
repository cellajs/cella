ALTER TABLE "tenants" DROP CONSTRAINT "tenants_created_by_users_id_fkey";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_updated_by_users_id_fkey";--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
UPDATE "attachments" SET "public" = true WHERE "public_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "attachments" DROP COLUMN "public_at";--> statement-breakpoint
UPDATE "organizations" SET "public" = true WHERE "public_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" DROP COLUMN "public_at";--> statement-breakpoint
ALTER TABLE "actors" ALTER COLUMN "last_seen_at" SET DATA TYPE timestamp with time zone USING "last_seen_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "actors" ALTER COLUMN "last_sign_in_at" SET DATA TYPE timestamp with time zone USING "last_sign_in_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "actors" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "attachments" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "attachments" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
-- Postgres cannot retype a column a policy reads: the select policy goes before and comes back after.
DROP POLICY "attachments_select_policy" ON "attachments";--> statement-breakpoint
ALTER TABLE "attachments" ALTER COLUMN "deleted_at" SET DATA TYPE timestamp with time zone USING "deleted_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "devices" ALTER COLUMN "first_seen_at" SET DATA TYPE timestamp with time zone USING "first_seen_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "devices" ALTER COLUMN "last_seen_at" SET DATA TYPE timestamp with time zone USING "last_seen_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "devices" ALTER COLUMN "notified_at" SET DATA TYPE timestamp with time zone USING "notified_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "identities" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "identities" ALTER COLUMN "verified_at" SET DATA TYPE timestamp with time zone USING "verified_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "identities" ALTER COLUMN "last_used_at" SET DATA TYPE timestamp with time zone USING "last_used_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "passkey_challenges" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "passkeys" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "revoked_at" SET DATA TYPE timestamp with time zone USING "revoked_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "stepped_up_at" SET DATA TYPE timestamp with time zone USING "stepped_up_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "tokens" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "totps" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "connections" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "connections" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "channel_counters" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "sync_incidents" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "sync_state" ALTER COLUMN "verified_at" SET DATA TYPE timestamp with time zone USING "verified_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "sync_state" ALTER COLUMN "rebuilt_at" SET DATA TYPE timestamp with time zone USING "rebuilt_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "inactive_memberships" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "inactive_memberships" ALTER COLUMN "rejected_at" SET DATA TYPE timestamp with time zone USING "rejected_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "inactive_memberships" ALTER COLUMN "reminded_at" SET DATA TYPE timestamp with time zone USING "reminded_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "memberships" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "memberships" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "notification_preferences" ALTER COLUMN "last_digest_at" SET DATA TYPE timestamp with time zone USING "last_digest_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "notification_preferences" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "read_at" SET DATA TYPE timestamp with time zone USING "read_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "emailed_at" SET DATA TYPE timestamp with time zone USING "emailed_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "digested_at" SET DATA TYPE timestamp with time zone USING "digested_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "oauth_clients" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "oauth_clients" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "oidc_payloads" ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone USING "expires_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "oidc_payloads" ALTER COLUMN "consumed_at" SET DATA TYPE timestamp with time zone USING "consumed_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "oidc_payloads" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "signing_keys" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "signing_keys" ALTER COLUMN "retired_at" SET DATA TYPE timestamp with time zone USING "retired_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "published_at" SET DATA TYPE timestamp with time zone USING "published_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "push_subscriptions" ALTER COLUMN "expiration_time" SET DATA TYPE timestamp with time zone USING "expiration_time" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "push_subscriptions" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "push_subscriptions" ALTER COLUMN "last_seen_at" SET DATA TYPE timestamp with time zone USING "last_seen_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "requests" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "requests" ALTER COLUMN "invited_at" SET DATA TYPE timestamp with time zone USING "invited_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "api_keys" ALTER COLUMN "revoked_at" SET DATA TYPE timestamp with time zone USING "revoked_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "api_keys" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "service_accounts" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "service_accounts" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "system_roles" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "system_roles" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "tenants" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "tenants" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "emails" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "emails" ALTER COLUMN "verified_at" SET DATA TYPE timestamp with time zone USING "verified_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "emails" ALTER COLUMN "last_verified_at" SET DATA TYPE timestamp with time zone USING "last_verified_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "yjs_documents" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "yjs_updates" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_updated_by_actors_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "actors"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD CONSTRAINT "oauth_clients_updated_by_actors_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "actors"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_created_by_actors_id_fkey" FOREIGN KEY ("created_by") REFERENCES "actors"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_updated_by_actors_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "actors"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_updated_by_actors_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "actors"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE POLICY "attachments_select_policy" ON "attachments" AS PERMISSIVE FOR SELECT TO public USING (
  COALESCE(current_setting('app.tenant_id', true), '') != ''
  AND "attachments"."tenant_id" = current_setting('app.tenant_id', true)::text
  AND ("attachments"."deleted_at" IS NULL OR current_setting('app.include_deleted', true) = 'true')
);
