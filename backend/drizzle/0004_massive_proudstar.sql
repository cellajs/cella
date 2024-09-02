ALTER TABLE "sessions" ADD COLUMN "device_name" varchar;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "device_type" varchar DEFAULT 'desktop' NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "device_os" varchar;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "browser" varchar;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "auth_strategy" varchar;