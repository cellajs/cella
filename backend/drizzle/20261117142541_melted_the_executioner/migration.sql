CREATE TABLE "product_number_moves" (
	"tenant_id" varchar(24) NOT NULL,
	"organization_id" uuid NOT NULL,
	"channel_id" uuid,
	"product_type" varchar,
	"number" integer,
	"entity_id" uuid NOT NULL,
	CONSTRAINT "product_number_moves_pkey" PRIMARY KEY("channel_id","product_type","number")
);
--> statement-breakpoint
CREATE TABLE "product_numbering" (
	"tenant_id" varchar(24) NOT NULL,
	"organization_id" uuid NOT NULL,
	"channel_id" uuid,
	"product_type" varchar,
	"last_number" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "product_numbering_pkey" PRIMARY KEY("channel_id","product_type")
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "number" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "attachments_home_number_unique" ON "attachments" ("organization_id","number") WHERE "number" > 0;--> statement-breakpoint
CREATE INDEX "product_number_moves_entity_id_index" ON "product_number_moves" ("entity_id");--> statement-breakpoint
ALTER TABLE "product_number_moves" ADD CONSTRAINT "product_number_moves_tenant_id_tenants_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id");--> statement-breakpoint
ALTER TABLE "product_number_moves" ADD CONSTRAINT "product_number_moves_SX7QzacU33Tr_fkey" FOREIGN KEY ("tenant_id","organization_id") REFERENCES "organizations"("tenant_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "product_numbering" ADD CONSTRAINT "product_numbering_tenant_id_tenants_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id");--> statement-breakpoint
ALTER TABLE "product_numbering" ADD CONSTRAINT "product_numbering_itamjET4RDM6_fkey" FOREIGN KEY ("tenant_id","organization_id") REFERENCES "organizations"("tenant_id","id") ON DELETE CASCADE;