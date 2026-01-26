DROP INDEX "activities_tx_field_index";--> statement-breakpoint
DROP INDEX "activities_tx_id_index";--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "seq" integer;--> statement-breakpoint
CREATE INDEX "activities_org_seq_index" ON "activities" USING btree ("organization_id","seq" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "activities_tx_id_index" ON "activities" USING btree ((tx->>'id'));