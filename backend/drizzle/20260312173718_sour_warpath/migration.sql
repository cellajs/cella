ALTER TABLE "attachments" DROP COLUMN "public_access";--> statement-breakpoint
ALTER POLICY "attachments_select_policy" ON "attachments" TO public USING (
  
  COALESCE(current_setting('app.tenant_id', true), '') != ''
  AND "attachments"."tenant_id" = current_setting('app.tenant_id', true)::text

  AND current_setting('app.is_authenticated', true)::boolean = true
  AND 
  COALESCE(current_setting('app.user_id', true), '') != ''
  AND EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.organization_id = "attachments"."organization_id"
    AND m.user_id = current_setting('app.user_id', true)::text
    AND m.tenant_id = "attachments"."tenant_id"
  )

);