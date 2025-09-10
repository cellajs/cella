CREATE TABLE "passwords" (
	"id" varchar PRIMARY KEY NOT NULL,
	"hashed_password" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"modified_at" timestamp,
	CONSTRAINT "passwords_userId_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "totps" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"encoder_secret_key" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unsubscribe_tokens" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"token" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unsubscribe_tokens_userId_unique" UNIQUE("user_id"),
	CONSTRAINT "unsubscribe_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_unsubscribeToken_unique";--> statement-breakpoint
DROP INDEX "users_token_index";--> statement-breakpoint
ALTER TABLE "passkeys" ADD COLUMN "device_name" varchar;--> statement-breakpoint
ALTER TABLE "passkeys" ADD COLUMN "device_type" varchar DEFAULT 'desktop' NOT NULL;--> statement-breakpoint
ALTER TABLE "passkeys" ADD COLUMN "device_os" varchar;--> statement-breakpoint
ALTER TABLE "passkeys" ADD COLUMN "browser" varchar;--> statement-breakpoint
ALTER TABLE "passkeys" ADD COLUMN "name_on_device" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "consumed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "passwords" ADD CONSTRAINT "passwords_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "totps" ADD CONSTRAINT "totps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unsubscribe_tokens" ADD CONSTRAINT "unsubscribe_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_token_index" ON "unsubscribe_tokens" USING btree ("token");--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "hashed_password";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "unsubscribe_token";