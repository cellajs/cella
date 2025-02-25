CREATE TABLE "emails" (
	"id" varchar PRIMARY KEY NOT NULL,
	"email" varchar NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"token_id" varchar,
	"user_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"verified_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_token_id_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "email_verified";