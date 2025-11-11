CREATE TABLE "system_roles" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"role" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"modified_at" timestamp,
	CONSTRAINT "system_roles_userId_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "system_roles" ADD CONSTRAINT "system_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "role";