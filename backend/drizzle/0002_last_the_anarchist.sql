ALTER TABLE "users" ADD COLUMN "unsubscribe_token" varchar NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_token_index" ON "users" USING btree ("unsubscribe_token");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_unsubscribe_token_unique" UNIQUE("unsubscribe_token");