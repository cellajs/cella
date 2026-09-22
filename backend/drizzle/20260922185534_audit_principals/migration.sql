ALTER TABLE "credentials" ADD COLUMN "revoked_by" uuid;--> statement-breakpoint
ALTER TABLE "service_accounts" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_revoked_by_principals_id_fkey" FOREIGN KEY ("revoked_by") REFERENCES "principals"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "service_accounts" ADD CONSTRAINT "service_accounts_updated_by_principals_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "principals"("id") ON DELETE SET NULL;