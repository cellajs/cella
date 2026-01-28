DROP INDEX "activities_org_seq_index";--> statement-breakpoint
CREATE INDEX "activities_organization_id_seq_index" ON "activities" USING btree ("organization_id","seq" desc);