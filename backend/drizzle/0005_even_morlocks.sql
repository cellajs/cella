ALTER TABLE "organizations" ALTER COLUMN "email_domains" SET DEFAULT '[]'::json;--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "email_domains" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "auth_strategies" SET DEFAULT '[]'::json;--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "auth_strategies" SET NOT NULL;