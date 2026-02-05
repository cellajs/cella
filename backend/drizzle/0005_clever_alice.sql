CREATE TABLE "counters" (
	"namespace" varchar NOT NULL,
	"scope" varchar NOT NULL,
	"key" varchar DEFAULT '' NOT NULL,
	"value" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "counters_namespace_scope_key_pk" PRIMARY KEY("namespace","scope","key")
);
--> statement-breakpoint
CREATE INDEX "counters_scope_idx" ON "counters" USING btree ("scope");