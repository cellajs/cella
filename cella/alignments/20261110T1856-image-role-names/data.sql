-- Above the generated `DROP COLUMN "logo_url"`: an organization's logo is its thumbnail, so a logo set where no thumbnail is keeps showing.
UPDATE "organizations" SET "thumbnail_url" = "logo_url" WHERE "thumbnail_url" IS NULL AND "logo_url" IS NOT NULL;--> statement-breakpoint
