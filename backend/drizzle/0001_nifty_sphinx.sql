ALTER TABLE "memberships" DROP CONSTRAINT "memberships_token_id_tokens_id_fk";
--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_token_id_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tokens"("id") ON DELETE cascade ON UPDATE no action;