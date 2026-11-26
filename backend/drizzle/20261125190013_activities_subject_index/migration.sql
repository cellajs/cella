DROP INDEX "activities_entity_type_subject_id_index";--> statement-breakpoint
CREATE INDEX "activities_entity_type_subject_id_index" ON "activities" ("entity_type","subject_id");