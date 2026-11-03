-- Stored impersonation rows go before the column that marked them: a leftover row would read as a session of the user's own.
DELETE FROM "sessions" WHERE "type" = 'impersonation';--> statement-breakpoint
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_impersonator_session_id_sessions_id_fkey";--> statement-breakpoint
DROP INDEX "sessions_impersonator_session_id_idx";--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN "impersonator_session_id";
