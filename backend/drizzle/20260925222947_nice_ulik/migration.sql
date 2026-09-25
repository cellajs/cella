ALTER TABLE "sessions" ADD COLUMN "impersonator_session_id" uuid;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "stepped_up_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "stepped_up_via" varchar;--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "session_id" uuid;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_impersonator_session_id_sessions_id_fkey" FOREIGN KEY ("impersonator_session_id") REFERENCES "sessions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_session_id_sessions_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE;