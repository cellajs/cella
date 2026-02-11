ALTER TABLE "inactive_memberships" DROP CONSTRAINT "inactive_memberships_tenant_email_org";--> statement-breakpoint
ALTER TABLE "memberships" DROP CONSTRAINT "memberships_tenant_user_org";--> statement-breakpoint
ALTER TABLE "inactive_memberships" ADD CONSTRAINT "inactive_memberships_tenant_email_ctx" UNIQUE NULLS NOT DISTINCT("tenant_id","email","context_type","organization_id");--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tenant_user_ctx" UNIQUE NULLS NOT DISTINCT("tenant_id","user_id","context_type","organization_id");