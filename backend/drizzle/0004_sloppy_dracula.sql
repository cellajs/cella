ALTER TABLE "activities" ADD COLUMN "error" jsonb;--> statement-breakpoint
CREATE INDEX "activities_error_lsn_index" ON "activities" USING btree ((error->>'lsn')) WHERE error IS NOT NULL;