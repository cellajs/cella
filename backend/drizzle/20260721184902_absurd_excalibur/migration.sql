ALTER TABLE "product_counters" RENAME COLUMN "entity_id" TO "product_id";--> statement-breakpoint
ALTER TABLE "product_counters" RENAME COLUMN "entity_type" TO "product_type";--> statement-breakpoint
ALTER TABLE "seen_by" RENAME COLUMN "entity_id" TO "product_id";--> statement-breakpoint
ALTER TABLE "seen_by" RENAME COLUMN "entity_type" TO "product_type";--> statement-breakpoint
ALTER INDEX "seen_by_user_entity_index" RENAME TO "seen_by_user_product_index";--> statement-breakpoint
ALTER INDEX "seen_by_entity_id_index" RENAME TO "seen_by_product_id_index";