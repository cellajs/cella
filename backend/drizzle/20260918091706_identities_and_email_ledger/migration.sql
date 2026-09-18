ALTER TABLE "oauth_accounts" RENAME TO "identities";--> statement-breakpoint
ALTER TABLE "tokens" RENAME COLUMN "oauth_account_id" TO "identity_id";--> statement-breakpoint
ALTER TABLE "identities" DROP CONSTRAINT "oauth_accounts_provider_provider_user_id_email_unique";--> statement-breakpoint
ALTER INDEX "oauth_accounts_user_id_idx" RENAME TO "identities_user_id_idx";--> statement-breakpoint
ALTER TABLE "identities" ADD COLUMN "kind" varchar DEFAULT 'oauth' NOT NULL;--> statement-breakpoint
ALTER TABLE "identities" ADD COLUMN "issuer" varchar(255);--> statement-breakpoint
ALTER TABLE "identities" ADD COLUMN "connection_id" varchar(255);--> statement-breakpoint
ALTER TABLE "identities" ADD COLUMN "data" jsonb;--> statement-breakpoint
ALTER TABLE "identities" ADD COLUMN "last_used_at" timestamp;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "last_verified_by" varchar(255);--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "last_verified_at" timestamp;--> statement-breakpoint
ALTER TABLE "emails" DROP COLUMN "token_id";--> statement-breakpoint
ALTER TABLE "identities" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "identities_provider_subject_idx" ON "identities" ("provider","provider_user_id",coalesce("issuer", ''));--> statement-breakpoint
UPDATE "emails" SET "last_verified_by" = 'magic', "last_verified_at" = "verified_at" WHERE "verified" = true AND "verified_at" IS NOT NULL;
