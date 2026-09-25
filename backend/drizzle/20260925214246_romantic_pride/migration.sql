CREATE TABLE "passkey_challenges" (
	"id" uuid PRIMARY KEY,
	"challenge_hash" varchar(64) NOT NULL,
	"purpose" varchar NOT NULL,
	"user_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "totps" ADD COLUMN "last_used_step" bigint;--> statement-breakpoint
DROP INDEX "passkeys_credential_id_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "passkeys_credential_id_idx" ON "passkeys" ("credential_id");--> statement-breakpoint
CREATE UNIQUE INDEX "passkey_challenges_challenge_hash_idx" ON "passkey_challenges" ("challenge_hash");--> statement-breakpoint
CREATE INDEX "passkey_challenges_expires_at_idx" ON "passkey_challenges" ("expires_at");--> statement-breakpoint
ALTER TABLE "passkey_challenges" ADD CONSTRAINT "passkey_challenges_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;