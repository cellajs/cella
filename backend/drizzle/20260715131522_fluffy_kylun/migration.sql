ALTER TABLE "sessions" ADD COLUMN "device_id_hash" varchar(64);--> statement-breakpoint
CREATE INDEX "sessions_user_id_device_id_hash_idx" ON "sessions" ("user_id","device_id_hash");