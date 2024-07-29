DROP TABLE "challenges";--> statement-breakpoint
ALTER TABLE "passkeys" RENAME COLUMN "user_id" TO "user_email";--> statement-breakpoint
ALTER TABLE "passkeys" DROP CONSTRAINT "passkeys_user_id_users_id_fk";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "passkeys" ADD CONSTRAINT "passkeys_user_email_users_email_fk" FOREIGN KEY ("user_email") REFERENCES "public"."users"("email") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
