-- publicAt cascade template — for forks migrating off `publicParent` / `publicParentOrSelf`.
--
-- Public read is now row-local: a row is publicly readable only when its OWN `publicAt` is set.
-- If you previously relied on "public because the parent is public" (the removed cascade modes),
-- you must propagate `publicAt` from the parent down to the child rows in DATA. This template does
-- it two ways: a one-time BACKFILL for existing rows, and a TRIGGER so future parent publish/unpublish
-- keeps children in sync.
--
-- This is a TEMPLATE. Replace the placeholders and run per (parent → child) relationship that used
-- a parent-cascade grant. It is intentionally not auto-applied: only you know your publish flow.
--
--   {{CHILD}}        child (product) table, e.g. tasks
--   {{PARENT}}       parent (channel) table, e.g. projects
--   {{PARENT_FK}}    child column pointing at the parent, e.g. project_id
--
-- Worked example (raak): {{CHILD}}=tasks, {{PARENT}}=projects, {{PARENT_FK}}=project_id.
-- Do the same for every entity the codemod reported (raak: tasks, attachments; projectcampus: item).

-- 1. Ensure the child carries the column. The channel/product base columns now provide `public_at`,
--    so this is usually already present after sync; keep it only if your child table predates that.
-- ALTER TABLE {{CHILD}} ADD COLUMN IF NOT EXISTS public_at timestamptz;

-- 2. One-time backfill: copy each parent's publicity onto its existing children.
UPDATE {{CHILD}} c
SET public_at = p.public_at
FROM {{PARENT}} p
WHERE c.{{PARENT_FK}} = p.id
  AND c.public_at IS DISTINCT FROM p.public_at;

-- 3. Keep children in sync when a parent is (un)published. Fires only when the parent's public_at
--    actually changes, and only rewrites children whose value differs (cheap, idempotent).
CREATE OR REPLACE FUNCTION cascade_public_at_{{CHILD}}() RETURNS trigger AS $$
BEGIN
  IF NEW.public_at IS DISTINCT FROM OLD.public_at THEN
    UPDATE {{CHILD}}
    SET public_at = NEW.public_at
    WHERE {{PARENT_FK}} = NEW.id
      AND public_at IS DISTINCT FROM NEW.public_at;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cascade_public_at_{{CHILD}} ON {{PARENT}};
CREATE TRIGGER trg_cascade_public_at_{{CHILD}}
  AFTER UPDATE OF public_at ON {{PARENT}}
  FOR EACH ROW
  EXECUTE FUNCTION cascade_public_at_{{CHILD}}();

-- Notes:
-- • A child created AFTER the parent is public also needs `public_at` set — do it in the child's
--   create path (copy the parent's `public_at`) or extend this with an INSERT trigger on {{CHILD}}.
-- • CDC already ships `public_at`; once children carry it, list endpoints, single-row reads, and SSE
--   all agree — which is the whole point of denormalizing rather than joining at read time.
-- • projectcampus note: its cascade was dormant (no anonymous surface). `comment` already denormalizes
--   `publicAt` from its item, so it needs no trigger; `item` only needs this if/when a public surface ships.
