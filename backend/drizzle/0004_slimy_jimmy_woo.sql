ALTER TABLE "users" ADD COLUMN "multi_factor_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "passkeys" DROP COLUMN "last_sign_in_at";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "two_factor_required";