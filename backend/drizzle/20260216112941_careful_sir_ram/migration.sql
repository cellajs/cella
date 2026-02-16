ALTER TABLE "inactive_memberships" ADD COLUMN "organization_slug" varchar(255);--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "organization_slug" varchar(255);--> statement-breakpoint
CREATE INDEX "inactive_memberships_organizationSlug_idx" ON "inactive_memberships" ("organization_slug");--> statement-breakpoint
CREATE INDEX "memberships_organizationSlug_idx" ON "memberships" ("organization_slug");