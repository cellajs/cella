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

);--> statement-breakpoint
ALTER POLICY "attachments_insert_policy" ON "attachments" TO public WITH CHECK (
  
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

);--> statement-breakpoint
ALTER POLICY "attachments_update_policy" ON "attachments" TO public USING (
  
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

) WITH CHECK (
  
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

);--> statement-breakpoint
ALTER POLICY "attachments_delete_policy" ON "attachments" TO public USING (
  
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

);--> statement-breakpoint
ALTER POLICY "inactive_memberships_select_policy" ON "inactive_memberships" TO public USING (
  
  COALESCE(current_setting('app.tenant_id', true), '') != ''
  AND "inactive_memberships"."tenant_id" = current_setting('app.tenant_id', true)::text

  AND current_setting('app.is_authenticated', true)::boolean = true
  AND 
  COALESCE(current_setting('app.user_id', true), '') != ''
  AND EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.organization_id = "inactive_memberships"."organization_id"
    AND m.user_id = current_setting('app.user_id', true)::text
    AND m.tenant_id = "inactive_memberships"."tenant_id"
  )

);--> statement-breakpoint
ALTER POLICY "inactive_memberships_insert_policy" ON "inactive_memberships" TO public WITH CHECK (
  
  COALESCE(current_setting('app.tenant_id', true), '') != ''
  AND "inactive_memberships"."tenant_id" = current_setting('app.tenant_id', true)::text

  AND current_setting('app.is_authenticated', true)::boolean = true
  AND 
  COALESCE(current_setting('app.user_id', true), '') != ''
  AND EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.organization_id = "inactive_memberships"."organization_id"
    AND m.user_id = current_setting('app.user_id', true)::text
    AND m.tenant_id = "inactive_memberships"."tenant_id"
  )

);--> statement-breakpoint
ALTER POLICY "inactive_memberships_update_policy" ON "inactive_memberships" TO public USING (
  
  COALESCE(current_setting('app.tenant_id', true), '') != ''
  AND "inactive_memberships"."tenant_id" = current_setting('app.tenant_id', true)::text

  AND current_setting('app.is_authenticated', true)::boolean = true
  AND 
  COALESCE(current_setting('app.user_id', true), '') != ''
  AND EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.organization_id = "inactive_memberships"."organization_id"
    AND m.user_id = current_setting('app.user_id', true)::text
    AND m.tenant_id = "inactive_memberships"."tenant_id"
  )

) WITH CHECK (
  
  COALESCE(current_setting('app.tenant_id', true), '') != ''
  AND "inactive_memberships"."tenant_id" = current_setting('app.tenant_id', true)::text

  AND current_setting('app.is_authenticated', true)::boolean = true
  AND 
  COALESCE(current_setting('app.user_id', true), '') != ''
  AND EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.organization_id = "inactive_memberships"."organization_id"
    AND m.user_id = current_setting('app.user_id', true)::text
    AND m.tenant_id = "inactive_memberships"."tenant_id"
  )

);--> statement-breakpoint
ALTER POLICY "inactive_memberships_delete_policy" ON "inactive_memberships" TO public USING (
  
  COALESCE(current_setting('app.tenant_id', true), '') != ''
  AND "inactive_memberships"."tenant_id" = current_setting('app.tenant_id', true)::text

  AND current_setting('app.is_authenticated', true)::boolean = true
  AND 
  COALESCE(current_setting('app.user_id', true), '') != ''
  AND EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.organization_id = "inactive_memberships"."organization_id"
    AND m.user_id = current_setting('app.user_id', true)::text
    AND m.tenant_id = "inactive_memberships"."tenant_id"
  )

);