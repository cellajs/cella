ALTER TABLE "context_counters" RENAME TO "channel_counters";--> statement-breakpoint
ALTER TABLE "channel_counters" RENAME COLUMN "context_key" TO "channel_key";--> statement-breakpoint
ALTER TABLE "inactive_memberships" RENAME COLUMN "context_type" TO "channel_type";--> statement-breakpoint
ALTER TABLE "inactive_memberships" RENAME COLUMN "context_id" TO "channel_id";--> statement-breakpoint
ALTER TABLE "memberships" RENAME COLUMN "context_type" TO "channel_type";--> statement-breakpoint
ALTER TABLE "memberships" RENAME COLUMN "context_id" TO "channel_id";--> statement-breakpoint
ALTER TABLE "seen_by" RENAME COLUMN "context_id" TO "channel_id";--> statement-breakpoint
ALTER INDEX "memberships_context_org_role_idx" RENAME TO "memberships_channel_org_role_idx";--> statement-breakpoint
ALTER INDEX "seen_by_user_context_type_index" RENAME TO "seen_by_user_channel_type_index";--> statement-breakpoint
ALTER TABLE "memberships" RENAME CONSTRAINT "memberships_unique_context" TO "memberships_unique_channel";