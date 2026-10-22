-- Before each `DROP COLUMN "public_at"` the generator emits: a row that was public stays public. One statement per
-- table that carried `public_at`; an app adds its own channel and product tables.
UPDATE "attachments" SET "public" = true WHERE "public_at" IS NOT NULL;--> statement-breakpoint
UPDATE "organizations" SET "public" = true WHERE "public_at" IS NOT NULL;--> statement-breakpoint

-- Postgres refuses to retype a column a policy reads (0A000). Every product table's select policy reads `deleted_at`:
-- drop it before the first `ALTER COLUMN ... SET DATA TYPE` of that table and recreate it after the last one, with the
-- statement from the migration that created it. One pair per product table; the template's:
DROP POLICY "attachments_select_policy" ON "attachments";--> statement-breakpoint
CREATE POLICY "attachments_select_policy" ON "attachments" AS PERMISSIVE FOR SELECT TO public USING (
  COALESCE(current_setting('app.tenant_id', true), '') != ''
  AND "attachments"."tenant_id" = current_setting('app.tenant_id', true)::text
  AND ("attachments"."deleted_at" IS NULL OR current_setting('app.include_deleted', true) = 'true')
);--> statement-breakpoint
