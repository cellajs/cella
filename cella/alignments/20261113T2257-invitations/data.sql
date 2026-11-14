-- After the generated statements: the table rename, the column renames, the new columns and indexes.

-- Postgres keeps the derived constraint names through a table rename; name them as drizzle derives them now.
-- Drizzle hashes a foreign key name past 63 characters, so the composite organization key is named here.
ALTER TABLE "invitations" RENAME CONSTRAINT "inactive_memberships_pkey" TO "invitations_pkey";--> statement-breakpoint
ALTER TABLE "invitations" RENAME CONSTRAINT "inactive_memberships_gmmCA2ACknk4_fkey" TO "invitations_Yt9Bq6Kr3lB9_fkey";--> statement-breakpoint

-- Every other foreign key on or to the table, an app's channel columns included, takes drizzle's
-- `<table>_<columns>_<referenced table>_<columns>_fkey`. A hashed one stops the migration: name it above as
-- `drizzle-kit export --config drizzle.config.ts` (from backend/) prints it.
DO $$
DECLARE
  fk record;
  hashed text[] := '{}';
BEGIN
  FOR fk IN
    SELECT c.conname, src.relname AS table_name,
      concat_ws('_', src.relname,
        (SELECT string_agg(a.attname, '_' ORDER BY k.n) FROM unnest(c.conkey) WITH ORDINALITY k(attnum, n)
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum),
        ref.relname,
        (SELECT string_agg(a.attname, '_' ORDER BY k.n) FROM unnest(c.confkey) WITH ORDINALITY k(attnum, n)
          JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.attnum),
        'fkey') AS derived
    FROM pg_constraint c
    JOIN pg_class src ON src.oid = c.conrelid
    JOIN pg_class ref ON ref.oid = c.confrelid
    WHERE c.contype = 'f' AND c.conname LIKE '%inactive\_membership%'
      AND 'invitations'::regclass::oid IN (c.conrelid, c.confrelid)
  LOOP
    IF length(fk.derived) > 63 THEN
      hashed := hashed || fk.conname::text;
    ELSE
      EXECUTE format('ALTER TABLE %I RENAME CONSTRAINT %I TO %I', fk.table_name, fk.conname, fk.derived);
    END IF;
  END LOOP;
  IF cardinality(hashed) > 0 THEN
    RAISE EXCEPTION 'Rename % by hand: drizzle hashes the name', array_to_string(hashed, ', ');
  END IF;
END $$;--> statement-breakpoint

-- The rename keeps the old immutability trigger; the side-effect migration installs invitations_immutable_keys_trigger.
DROP TRIGGER IF EXISTS "inactive_memberships_immutable_keys_trigger" ON "invitations";--> statement-breakpoint
DROP FUNCTION IF EXISTS inactive_membership_immutable_keys();--> statement-breakpoint

-- The resource type `inactive_membership` is `invitation`. Activities are append-only, so the trigger steps aside.
ALTER TABLE "activities" DISABLE TRIGGER "activities_immutable_keys_trigger";--> statement-breakpoint
UPDATE "activities"
SET "resource_type" = 'invitation', "type" = replace("type", 'inactive_membership.', 'invitation.'), "table_name" = 'invitations'
WHERE "resource_type" = 'inactive_membership';--> statement-breakpoint
ALTER TABLE "activities" ENABLE TRIGGER "activities_immutable_keys_trigger";--> statement-breakpoint

-- A declined invitation is declined since its decline; any other is pending since its creation.
UPDATE "invitations"
SET "status" = CASE WHEN "declined_at" IS NOT NULL THEN 'declined' ELSE 'pending' END,
  "status_changed_at" = coalesce("declined_at", "created_at");--> statement-breakpoint

-- Held: never mailed, to a channel still a draft. One statement per channel table with drafts; the template has one.
UPDATE "invitations" i
SET "status" = 'held'
FROM "organizations" c
WHERE i."channel_type" = 'organization' AND i."channel_id" = c."id" AND c."published_at" IS NULL
  AND i."status" = 'pending' AND i."mailed_at" IS NULL;
