ALTER TABLE "attachments" ALTER COLUMN "description" SET DATA TYPE varchar(1000000) USING "description"::varchar(1000000);--> statement-breakpoint
ALTER TABLE "attachments" ALTER COLUMN "keywords" SET DATA TYPE varchar(1000000) USING "keywords"::varchar(1000000);--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "welcome_text" SET DATA TYPE varchar(1000000) USING "welcome_text"::varchar(1000000);--> statement-breakpoint
ALTER TABLE "pages" ALTER COLUMN "description" SET DATA TYPE varchar(1000000) USING "description"::varchar(1000000);--> statement-breakpoint
ALTER TABLE "pages" ALTER COLUMN "keywords" SET DATA TYPE varchar(1000000) USING "keywords"::varchar(1000000);