CREATE TABLE "sync_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"kind" varchar NOT NULL,
	"reason" varchar NOT NULL,
	"position_from" varchar(255),
	"position_to" varchar(255),
	"error" text,
	"corrections" jsonb DEFAULT '[]' NOT NULL,
	"generation" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_state" (
	"id" varchar(255) PRIMARY KEY DEFAULT 'sync',
	"generation" integer DEFAULT 1 NOT NULL,
	"requested" varchar,
	"requested_at" timestamp,
	"verified_at" timestamp,
	"rebuilt_at" timestamp,
	"fence" jsonb
);
