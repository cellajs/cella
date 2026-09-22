ALTER TABLE "oidc_payloads" ADD COLUMN "account_id" varchar(255);--> statement-breakpoint
CREATE INDEX "oidc_payloads_account_id_idx" ON "oidc_payloads" ("account_id");