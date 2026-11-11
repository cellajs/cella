ALTER TABLE "activities" RENAME COLUMN "user_id" TO "actor_id";--> statement-breakpoint
ALTER TABLE "identities" RENAME COLUMN "issuer" TO "provider";--> statement-breakpoint
ALTER TABLE "sessions" RENAME COLUMN "secret" TO "secret_hash";--> statement-breakpoint
ALTER TABLE "sessions" RENAME COLUMN "stepped_up_secret" TO "stepped_up_secret_hash";--> statement-breakpoint
ALTER TABLE "tokens" RENAME COLUMN "secret" TO "secret_hash";--> statement-breakpoint
ALTER TABLE "connections" RENAME COLUMN "issuer" TO "federation";--> statement-breakpoint
ALTER TABLE "connections" RENAME COLUMN "display_name" TO "name";--> statement-breakpoint
ALTER TABLE "inactive_memberships" RENAME COLUMN "rejected_at" TO "declined_at";--> statement-breakpoint
ALTER TABLE "notification_preferences" RENAME COLUMN "mention_email" TO "mention_emails";--> statement-breakpoint
ALTER TABLE "notification_preferences" RENAME COLUMN "comment_email" TO "comment_emails";--> statement-breakpoint
ALTER TABLE "notifications" RENAME COLUMN "entity_type" TO "product_type";--> statement-breakpoint
ALTER INDEX "identities_kind_issuer_subject_idx" RENAME TO "identities_kind_provider_subject_idx";--> statement-breakpoint
ALTER INDEX "sessions_secret_idx" RENAME TO "sessions_secret_hash_idx";--> statement-breakpoint
ALTER INDEX "tokens_secret_kind_idx" RENAME TO "tokens_secret_hash_kind_idx";--> statement-breakpoint
-- An organization's logo is its thumbnail: a logo set where no thumbnail is keeps showing.
UPDATE "organizations" SET "thumbnail_url" = "logo_url" WHERE "thumbnail_url" IS NULL AND "logo_url" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" DROP COLUMN "logo_url";--> statement-breakpoint
ALTER TABLE "tenants" ALTER COLUMN "restrictions" SET DEFAULT '{"quotas":{"user":1000,"organization":1,"attachment":100,"serviceAccount":20,"apiKey":100},"rateLimits":{"apiPointsPerHour":1000,"invitationEmailsPerDay":250},"allowUnregisteredClients":true}';--> statement-breakpoint
-- A pending OAuth sign-up names its provider under `provider`, as the identity it becomes does.
UPDATE "tokens" SET "pending_sign_up" = ("pending_sign_up" - 'issuer') || jsonb_build_object('provider', "pending_sign_up" -> 'issuer') WHERE "pending_sign_up" ? 'issuer';--> statement-breakpoint
-- A stored tenant keeps its daily invitation cap under the key the code reads.
UPDATE "tenants" SET "restrictions" = jsonb_set("restrictions" #- '{rateLimits,invitationMailsPerDay}', '{rateLimits,invitationEmailsPerDay}', "restrictions" -> 'rateLimits' -> 'invitationMailsPerDay') WHERE "restrictions" -> 'rateLimits' ? 'invitationMailsPerDay';
