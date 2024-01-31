ALTER TABLE "users" DROP CONSTRAINT "users_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "language" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "oauth_accounts" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "type" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "demo_user";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "accept_invitation_at";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "invitation_at";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "last_post_at";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "created_by";