-- Top of the migration, before `retired_at` is dropped: no app retired a key, but a row that says so would block the
-- unique index on `status`, which no longer filters.
DELETE FROM "signing_keys" WHERE "status" NOT IN ('current', 'next');
