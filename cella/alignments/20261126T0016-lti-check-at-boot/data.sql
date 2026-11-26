-- Append to the migration `pnpm generate` writes for the new role default. Replace both role names first.
UPDATE "memberships" SET "role" = '<replacement>' WHERE "role" = '<removed>';--> statement-breakpoint
UPDATE "invitations" SET "role" = '<replacement>' WHERE "role" = '<removed>';
