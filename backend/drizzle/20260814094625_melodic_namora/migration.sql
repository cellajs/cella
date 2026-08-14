ALTER TABLE "passkeys" ADD COLUMN "counter" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ALTER COLUMN "restrictions" SET DEFAULT '{"quotas":{"user":1000,"organization":1,"attachment":100},"rateLimits":{"apiPointsPerHour":1000}}';--> statement-breakpoint
-- Clean break (pre-production): stored credentials predate the @simplewebauthn migration
-- (base64 credential ids, SEC1 public keys) and can never verify again; users re-enroll.
DELETE FROM "passkeys";
