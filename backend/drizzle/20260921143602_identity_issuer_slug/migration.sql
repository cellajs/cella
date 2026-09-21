ALTER TABLE "identities" RENAME COLUMN "provider_user_id" TO "subject";--> statement-breakpoint
DROP INDEX "identities_provider_subject_idx";--> statement-breakpoint
-- Hand-added: the provider slug becomes the issuer slug, so rows survive the drop and the NOT NULL below.
UPDATE "identities" SET "issuer" = "provider";--> statement-breakpoint
ALTER TABLE "identities" DROP COLUMN "provider";--> statement-breakpoint
ALTER TABLE "identities" ALTER COLUMN "issuer" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "identities_kind_issuer_subject_idx" ON "identities" ("kind","issuer","subject");