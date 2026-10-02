ALTER TABLE "sessions" ADD COLUMN "connection_id" uuid;--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "auth_strategy" varchar;