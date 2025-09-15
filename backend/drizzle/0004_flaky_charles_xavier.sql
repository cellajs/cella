ALTER TABLE "attachments" ADD COLUMN "public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "bucket_name" varchar NOT NULL;