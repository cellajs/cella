ALTER TABLE "seen_by" DROP CONSTRAINT "seen_by_user_entity_unique";--> statement-breakpoint
CREATE INDEX "seen_by_user_entity_index" ON "seen_by" ("user_id","entity_id");