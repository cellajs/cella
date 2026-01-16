CREATE INDEX "inactive_memberships_user_id_idx" ON "inactive_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "inactive_memberships_organization_id_idx" ON "inactive_memberships" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "inactive_memberships_email_idx" ON "inactive_memberships" USING btree ("email");--> statement-breakpoint
CREATE INDEX "memberships_user_id_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "memberships_organization_id_idx" ON "memberships" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "sessions_token_idx" ON "sessions" USING btree ("token");--> statement-breakpoint
CREATE INDEX "tokens_token_type_idx" ON "tokens" USING btree ("token","type");