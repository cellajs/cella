ALTER TABLE "passkeys" ADD COLUMN "transports" varchar(255)[];--> statement-breakpoint
ALTER TABLE "passkeys" ALTER COLUMN "counter" SET DATA TYPE bigint USING "counter"::bigint;--> statement-breakpoint
DROP INDEX "totps_user_id_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "totps_user_id_idx" ON "totps" ("user_id");