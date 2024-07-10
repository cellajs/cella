ALTER TABLE "labels" ADD COLUMN "last_used" timestamp NOT NULL;--> statement-breakpoint
ALTER TABLE "labels" ADD COLUMN "use_count" integer NOT NULL;