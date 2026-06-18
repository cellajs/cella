ALTER TABLE "pages" DROP CONSTRAINT "pages_group_order";--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "pages_group_order" ON "pages" ("parent_id","display_order") WHERE "deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_deleted_by_users_id_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_deleted_by_users_id_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER POLICY "attachments_select_policy" ON "attachments" TO public USING (
    
  COALESCE(current_setting('app.tenant_id', true), '') != ''
  AND "attachments"."tenant_id" = current_setting('app.tenant_id', true)::text

    AND ("attachments"."deleted_at" IS NULL OR current_setting('app.include_deleted', true) = 'true')
  );--> statement-breakpoint
ALTER POLICY "yjs_documents_select_policy" ON "yjs_documents" TO public USING (
    
  COALESCE(current_setting('app.tenant_id', true), '') != ''
  AND "yjs_documents"."tenant_id" = current_setting('app.tenant_id', true)::text

    
  );