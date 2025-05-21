ALTER TABLE "memberships" RENAME COLUMN "type" TO "context_type";--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "description" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "description" varchar;--> statement-breakpoint
CREATE INDEX "attachments_organization_id_index" ON "attachments" USING btree ("organization_id");