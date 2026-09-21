CREATE TABLE "devices" (
	"user_id" uuid,
	"device_id_hash" varchar(64),
	"first_seen_at" timestamp NOT NULL,
	"last_seen_at" timestamp NOT NULL,
	"notified_at" timestamp,
	"last_strategy" varchar NOT NULL,
	"device_name" varchar(255),
	"device_type" varchar DEFAULT 'desktop' NOT NULL,
	"device_os" varchar(255),
	"browser" varchar(255),
	"ip_country" varchar(2),
	CONSTRAINT "devices_pkey" PRIMARY KEY("user_id","device_id_hash")
);
--> statement-breakpoint
CREATE INDEX "devices_user_id_notified_at_idx" ON "devices" ("user_id","notified_at");--> statement-breakpoint
CREATE INDEX "devices_last_seen_at_idx" ON "devices" ("last_seen_at");--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;