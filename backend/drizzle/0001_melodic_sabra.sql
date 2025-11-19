ALTER TABLE "tokens" DROP CONSTRAINT "tokens_inactive_membership_id_inactive_memberships_id_fk";
--> statement-breakpoint
ALTER TABLE "inactive_memberships" ADD COLUMN "email" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "inactive_memberships" ADD COLUMN "token_id" varchar;--> statement-breakpoint
ALTER TABLE "inactive_memberships" ADD CONSTRAINT "inactive_memberships_token_id_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tokens"("id") ON DELETE set null ON UPDATE no action;