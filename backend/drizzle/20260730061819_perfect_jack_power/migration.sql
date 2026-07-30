ALTER TABLE "attachments" ADD COLUMN "keys" jsonb DEFAULT '{}' NOT NULL;--> statement-breakpoint
UPDATE "attachments" SET "keys" = jsonb_strip_nulls(jsonb_build_object(
	'original', "original_key",
	'converted', "converted_key",
	'preview', "thumbnail_key",
	'thumbnail', "thumbnail_tiny_key"
));--> statement-breakpoint
ALTER TABLE "attachments" DROP COLUMN "original_key";--> statement-breakpoint
ALTER TABLE "attachments" DROP COLUMN "converted_key";--> statement-breakpoint
ALTER TABLE "attachments" DROP COLUMN "thumbnail_key";--> statement-breakpoint
ALTER TABLE "attachments" DROP COLUMN "thumbnail_tiny_key";