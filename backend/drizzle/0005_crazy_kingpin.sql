ALTER TABLE "oauth_accounts" ADD COLUMN "access_token" varchar;--> statement-breakpoint
ALTER TABLE "oauth_accounts" ADD COLUMN "refresh_token" varchar;--> statement-breakpoint
ALTER TABLE "oauth_accounts" ADD COLUMN "token_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "scaleway_backend_stage_id" varchar;--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "scaleway_dns_stage_id" varchar;