DROP POLICY "attachments_select_policy" ON "attachments";--> statement-breakpoint
DROP POLICY "attachments_insert_policy" ON "attachments";--> statement-breakpoint
DROP POLICY "attachments_update_policy" ON "attachments";--> statement-breakpoint
DROP POLICY "attachments_delete_policy" ON "attachments";--> statement-breakpoint
DROP POLICY "yjs_documents_select_policy" ON "yjs_documents";--> statement-breakpoint
DROP POLICY "yjs_documents_insert_policy" ON "yjs_documents";--> statement-breakpoint
DROP POLICY "yjs_documents_update_policy" ON "yjs_documents";--> statement-breakpoint
DROP POLICY "yjs_documents_delete_policy" ON "yjs_documents";--> statement-breakpoint
DROP POLICY "yjs_updates_select_policy" ON "yjs_updates";--> statement-breakpoint
DROP POLICY "yjs_updates_insert_policy" ON "yjs_updates";--> statement-breakpoint
DROP POLICY "yjs_updates_update_policy" ON "yjs_updates";--> statement-breakpoint
DROP POLICY "yjs_updates_delete_policy" ON "yjs_updates";--> statement-breakpoint
CREATE POLICY "attachments_tenant_policy" ON "attachments" AS PERMISSIVE FOR ALL TO public USING (
    
  COALESCE((SELECT current_setting('app.tenant_id', true)), '') != ''
  AND "attachments"."tenant_id" = (SELECT current_setting('app.tenant_id', true))

    AND ("attachments"."deleted_at" IS NULL OR (SELECT current_setting('app.include_deleted', true)) = 'true')
  );--> statement-breakpoint
CREATE POLICY "yjs_documents_tenant_policy" ON "yjs_documents" AS PERMISSIVE FOR ALL TO public USING (
    
  COALESCE((SELECT current_setting('app.tenant_id', true)), '') != ''
  AND "yjs_documents"."tenant_id" = (SELECT current_setting('app.tenant_id', true))

    
  );--> statement-breakpoint
CREATE POLICY "yjs_updates_tenant_policy" ON "yjs_updates" AS PERMISSIVE FOR ALL TO public USING (
    
  COALESCE((SELECT current_setting('app.tenant_id', true)), '') != ''
  AND "yjs_updates"."tenant_id" = (SELECT current_setting('app.tenant_id', true))

    
  );