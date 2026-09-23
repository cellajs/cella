ALTER TABLE "principals" RENAME TO "actors";--> statement-breakpoint
ALTER TABLE "api_keys" RENAME COLUMN "principal_id" TO "actor_id";--> statement-breakpoint
ALTER INDEX "api_keys_principal_id_idx" RENAME TO "api_keys_actor_id_idx";--> statement-breakpoint
ALTER TABLE "actors" RENAME CONSTRAINT "principals_pkey" TO "actors_pkey";--> statement-breakpoint
ALTER TABLE "api_keys" RENAME CONSTRAINT "api_keys_principal_id_principals_id_fkey" TO "api_keys_actor_id_actors_id_fkey";--> statement-breakpoint
ALTER TABLE "api_keys" RENAME CONSTRAINT "api_keys_created_by_principals_id_fkey" TO "api_keys_created_by_actors_id_fkey";--> statement-breakpoint
ALTER TABLE "api_keys" RENAME CONSTRAINT "api_keys_revoked_by_principals_id_fkey" TO "api_keys_revoked_by_actors_id_fkey";--> statement-breakpoint
ALTER TABLE "attachments" RENAME CONSTRAINT "attachments_created_by_principals_id_fkey" TO "attachments_created_by_actors_id_fkey";--> statement-breakpoint
ALTER TABLE "attachments" RENAME CONSTRAINT "attachments_updated_by_principals_id_fkey" TO "attachments_updated_by_actors_id_fkey";--> statement-breakpoint
ALTER TABLE "attachments" RENAME CONSTRAINT "attachments_deleted_by_principals_id_fkey" TO "attachments_deleted_by_actors_id_fkey";--> statement-breakpoint
ALTER TABLE "oauth_clients" RENAME CONSTRAINT "oauth_clients_created_by_principals_id_fkey" TO "oauth_clients_created_by_actors_id_fkey";--> statement-breakpoint
ALTER TABLE "organizations" RENAME CONSTRAINT "organizations_created_by_principals_id_fkey" TO "organizations_created_by_actors_id_fkey";--> statement-breakpoint
ALTER TABLE "organizations" RENAME CONSTRAINT "organizations_updated_by_principals_id_fkey" TO "organizations_updated_by_actors_id_fkey";--> statement-breakpoint
ALTER TABLE "service_accounts" RENAME CONSTRAINT "service_accounts_id_principals_id_fkey" TO "service_accounts_id_actors_id_fkey";--> statement-breakpoint
ALTER TABLE "service_accounts" RENAME CONSTRAINT "service_accounts_created_by_principals_id_fkey" TO "service_accounts_created_by_actors_id_fkey";--> statement-breakpoint
ALTER TABLE "service_accounts" RENAME CONSTRAINT "service_accounts_updated_by_principals_id_fkey" TO "service_accounts_updated_by_actors_id_fkey";--> statement-breakpoint
ALTER TABLE "users" RENAME CONSTRAINT "users_id_principals_id_fkey" TO "users_id_actors_id_fkey";
