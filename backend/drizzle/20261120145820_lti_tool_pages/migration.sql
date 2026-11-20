ALTER TABLE "oauth_clients" ADD COLUMN "client_uri" varchar(2048);--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD COLUMN "tos_uri" varchar(2048);--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD COLUMN "policy_uri" varchar(2048);