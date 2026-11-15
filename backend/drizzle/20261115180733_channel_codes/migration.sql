CREATE TABLE "channel_codes" (
	"code" varchar(7) PRIMARY KEY,
	"tenant_id" varchar(24) NOT NULL,
	"channel_type" varchar NOT NULL,
	"channel_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "code" varchar(7) DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "channel_codes_channel_id_unique" ON "channel_codes" ("channel_id");--> statement-breakpoint
ALTER TABLE "channel_codes" ADD CONSTRAINT "channel_codes_tenant_id_tenants_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;