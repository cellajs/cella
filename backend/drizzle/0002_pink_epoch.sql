CREATE TABLE "totps" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"encoder_secret_key" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "passkeys" ADD COLUMN "device_name" varchar;--> statement-breakpoint
ALTER TABLE "passkeys" ADD COLUMN "device_type" varchar DEFAULT 'desktop' NOT NULL;--> statement-breakpoint
ALTER TABLE "passkeys" ADD COLUMN "device_os" varchar;--> statement-breakpoint
ALTER TABLE "passkeys" ADD COLUMN "browser" varchar;--> statement-breakpoint
ALTER TABLE "passkeys" ADD COLUMN "name_on_device" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "passkeys" ADD COLUMN "last_sign_in_at" timestamp;--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "consumed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "two_factor_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "totps" ADD CONSTRAINT "totps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;