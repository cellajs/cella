DROP INDEX "attachments_created_by_index";--> statement-breakpoint
CREATE INDEX "attachments_created_by_index" ON "attachments" ("created_by","organization_id");