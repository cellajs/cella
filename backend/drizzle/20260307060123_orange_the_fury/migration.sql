DROP INDEX "activities_organization_id_seq_index";--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "seq_at" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "seq_at" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "activities" DROP COLUMN "seq";--> statement-breakpoint
CREATE INDEX "attachments_org_seq_at_index" ON "attachments" ("organization_id","seq_at");--> statement-breakpoint
CREATE INDEX "pages_seq_at_idx" ON "pages" ("seq_at");