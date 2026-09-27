CREATE TABLE "passkey_challenges" (
	"id" uuid PRIMARY KEY,
	"challenge_hash" varchar(64) NOT NULL,
	"purpose" varchar NOT NULL,
	"user_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "impersonator_session_id" uuid;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "stepped_up_at" timestamp;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "stepped_up_via" varchar;--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "pending_sign_up" jsonb;--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "session_id" uuid;--> statement-breakpoint
ALTER TABLE "totps" ADD COLUMN "last_used_step" bigint;--> statement-breakpoint
DROP INDEX "passkeys_credential_id_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "passkeys_credential_id_idx" ON "passkeys" ("credential_id");--> statement-breakpoint
CREATE UNIQUE INDEX "passkey_challenges_challenge_hash_idx" ON "passkey_challenges" ("challenge_hash");--> statement-breakpoint
CREATE INDEX "passkey_challenges_expires_at_idx" ON "passkey_challenges" ("expires_at");--> statement-breakpoint
CREATE INDEX "sessions_impersonator_session_id_idx" ON "sessions" ("impersonator_session_id") WHERE "impersonator_session_id" is not null;--> statement-breakpoint
CREATE INDEX "tokens_session_id_idx" ON "tokens" ("session_id") WHERE "session_id" is not null;--> statement-breakpoint
ALTER TABLE "passkey_challenges" ADD CONSTRAINT "passkey_challenges_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_impersonator_session_id_sessions_id_fkey" FOREIGN KEY ("impersonator_session_id") REFERENCES "sessions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_session_id_sessions_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE;