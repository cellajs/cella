ALTER TABLE "lti_installations" ADD COLUMN "granted_scopes" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD COLUMN "requested_scopes" jsonb;