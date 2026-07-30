-- Existing rows can violate the new uniqueness: the previous app-level guard matched an
-- arbitrary row across types, and rows predating email normalization differ only in case.
-- Deduplicate first, keeping the oldest row per (lower(email), type).
DELETE FROM "requests" dup
USING "requests" keep
WHERE dup."type" IN ('waitlist', 'newsletter')
  AND keep."type" = dup."type"
  AND lower(keep."email") = lower(dup."email")
  AND keep."id" <> dup."id"
  AND (keep."created_at", keep."id") < (dup."created_at", dup."id");--> statement-breakpoint
-- Normalize legacy casing so app-level exact-match lookups agree with the index.
-- Safe after the dedupe: uniqueness on lower(email) already holds.
UPDATE "requests" SET "email" = lower("email") WHERE "email" <> lower("email");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "requests_unique_signup_email_type" ON "requests" (lower("email"),"type") WHERE "type" in ('waitlist', 'newsletter');
