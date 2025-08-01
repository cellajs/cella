ALTER TABLE "oauth_accounts" DROP CONSTRAINT "oauth_accounts_provider_id_provider_user_id_pk";--> statement-breakpoint
ALTER TABLE "oauth_accounts" ADD COLUMN "id" varchar PRIMARY KEY NOT NULL;--> statement-breakpoint
ALTER TABLE "oauth_accounts" ADD COLUMN "email" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "oauth_accounts" ADD COLUMN "verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "oauth_accounts" ADD COLUMN "verified_at" timestamp;--> statement-breakpoint
ALTER TABLE "oauth_accounts" ADD COLUMN "tenant_id" varchar;--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "oauth_account_id" varchar;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_oauth_account_id_oauth_accounts_id_fk" FOREIGN KEY ("oauth_account_id") REFERENCES "public"."oauth_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_providerId_providerUserId_email_unique" UNIQUE("provider_id","provider_user_id","email");