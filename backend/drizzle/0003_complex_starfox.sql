CREATE TABLE "passwords" (
	"id" varchar PRIMARY KEY NOT NULL,
	"hashed_password" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"modified_at" timestamp,
	CONSTRAINT "passwords_userId_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "passwords" ADD CONSTRAINT "passwords_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "hashed_password";