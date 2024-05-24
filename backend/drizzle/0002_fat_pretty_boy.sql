ALTER TABLE "memberships" ADD COLUMN "entity" varchar DEFAULT 'membership' NOT NULL;--> statement-breakpoint
ALTER TABLE "oauth_accounts" ADD COLUMN "entity" varchar DEFAULT 'oauthAccount' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "entity" varchar DEFAULT 'organization' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "entity" varchar DEFAULT 'project' NOT NULL;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "entity" varchar DEFAULT 'request' NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "entity" varchar DEFAULT 'session' NOT NULL;--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "entity" varchar DEFAULT 'token' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "entity" varchar DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "entity" varchar DEFAULT 'workspace' NOT NULL;