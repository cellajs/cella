-- Top of the migration, before `verified` is dropped: a verified identity without a stamp keeps its verification.
UPDATE "identities" SET "verified_at" = "created_at" WHERE "verified" AND "verified_at" IS NULL;
