CREATE TABLE "pages" (
	"id" varchar PRIMARY KEY NOT NULL,
	"entity_type" varchar DEFAULT 'page' NOT NULL,
	"slug" varchar NOT NULL,
	"title" varchar NOT NULL,
	"content" varchar NOT NULL,
	"keywords" varchar NOT NULL,
	"status" varchar DEFAULT 'unpublished' NOT NULL,
	"parent_id" varchar,
	"display_order" double precision NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" varchar,
	"modified_at" timestamp,
	"modified_by" varchar,
	CONSTRAINT "pages_slug_unique" UNIQUE("slug"),
	CONSTRAINT "group_order" UNIQUE("parent_id","display_order")
);
--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "restrictions" SET DEFAULT '{"user":1000,"attachment":100,"page":0}'::json;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_parent_id_pages_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_modified_by_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;