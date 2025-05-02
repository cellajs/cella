ALTER TABLE "attachments" RENAME COLUMN "url" TO "original_key";--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "restrictions" SET DEFAULT '{"user":1000,"attachment":100}'::json;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "converted_key" varchar;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "thumbnail_key" varchar;