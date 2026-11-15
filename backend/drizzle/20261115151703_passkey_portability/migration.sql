ALTER TABLE "passkeys" ADD COLUMN "aaguid" varchar(36);--> statement-breakpoint
ALTER TABLE "passkeys" ADD COLUMN "attestation_format" varchar(255);--> statement-breakpoint
ALTER TABLE "passkeys" ADD COLUMN "backup_eligible" boolean;--> statement-breakpoint
ALTER TABLE "passkeys" ADD COLUMN "backup_state" boolean;--> statement-breakpoint
ALTER TABLE "passkeys" ADD COLUMN "user_handle" varchar(255);--> statement-breakpoint
ALTER TABLE "passkeys" ADD COLUMN "last_used_at" timestamp with time zone;