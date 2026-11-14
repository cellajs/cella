-- Before `ADD CONSTRAINT "sessions_revocation_reason_check"`: a revoked row without a reason reads as signed out, and a
-- reason on a row that was never revoked goes.
UPDATE "sessions" SET "revocation_reason" = 'sign_out' WHERE "revoked_at" IS NOT NULL AND "revocation_reason" IS NULL;
UPDATE "sessions" SET "revocation_reason" = NULL WHERE "revoked_at" IS NULL AND "revocation_reason" IS NOT NULL;
