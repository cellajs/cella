ALTER TABLE "sessions" ADD COLUMN "revoked_at" timestamp;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "revoked_by" uuid;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "revocation_reason" varchar;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_revoked_by_actors_id_fkey" FOREIGN KEY ("revoked_by") REFERENCES "actors"("id") ON DELETE SET NULL;