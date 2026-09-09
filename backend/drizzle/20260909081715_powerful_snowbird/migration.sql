CREATE TABLE "yjs_updates" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "yjs_updates_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"entity_type" varchar(50) NOT NULL,
	"entity_id" uuid NOT NULL,
	"tenant_id" varchar(24) NOT NULL,
	"organization_id" uuid,
	"user_id" uuid,
	"payload" bytea NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "yjs_updates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "yjs_documents" DROP COLUMN "last_edited_by";--> statement-breakpoint
CREATE INDEX "idx_yjs_updates_doc" ON "yjs_updates" ("entity_type","entity_id","id");--> statement-breakpoint
CREATE INDEX "idx_yjs_updates_tenant" ON "yjs_updates" ("tenant_id");--> statement-breakpoint
ALTER TABLE "yjs_updates" ADD CONSTRAINT "yjs_updates_tenant_id_tenants_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id");--> statement-breakpoint
ALTER TABLE "yjs_updates" ADD CONSTRAINT "yjs_updates_Yt7qMI3dLu4u_fkey" FOREIGN KEY ("tenant_id","organization_id") REFERENCES "organizations"("tenant_id","id") ON DELETE CASCADE;--> statement-breakpoint
CREATE POLICY "yjs_updates_select_policy" ON "yjs_updates" AS PERMISSIVE FOR SELECT TO public USING (
    
  COALESCE(current_setting('app.tenant_id', true), '') != ''
  AND "yjs_updates"."tenant_id" = current_setting('app.tenant_id', true)::text

    
  );--> statement-breakpoint
CREATE POLICY "yjs_updates_insert_policy" ON "yjs_updates" AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "yjs_updates_update_policy" ON "yjs_updates" AS PERMISSIVE FOR UPDATE TO public USING (true);--> statement-breakpoint
CREATE POLICY "yjs_updates_delete_policy" ON "yjs_updates" AS PERMISSIVE FOR DELETE TO public USING (true);