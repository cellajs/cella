ALTER TABLE "tokens" ALTER COLUMN "email" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "membership_info" json;