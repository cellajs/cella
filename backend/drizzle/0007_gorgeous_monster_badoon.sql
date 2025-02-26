ALTER TABLE "emails" DROP CONSTRAINT "emails_token_id_tokens_id_fk";
--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_token_id_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tokens"("id") ON DELETE set null ON UPDATE no action;