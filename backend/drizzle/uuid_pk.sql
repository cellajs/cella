
-- Create UUID PK columns.
-- Note: we can't alter varchar to UUID directly, so we need to add UUID column first.

ALTER TABLE "memberships" ADD COLUMN "uuid" UUID DEFAULT (gen_random_uuid());
ALTER TABLE "organizations" ADD COLUMN "uuid" UUID DEFAULT (gen_random_uuid());
ALTER TABLE "sessions" ADD COLUMN "uuid" UUID DEFAULT (gen_random_uuid());
ALTER TABLE "tokens" ADD COLUMN "uuid" UUID DEFAULT (gen_random_uuid());
ALTER TABLE "users" ADD COLUMN "uuid" UUID DEFAULT (gen_random_uuid());
ALTER TABLE "workspaces" ADD COLUMN "uuid" UUID DEFAULT (gen_random_uuid());


-- Create UUID columns, and transfer the foreign key relations to new UUID columns.
-- sql format for transfer:
-- UPDATE table_has_fk t_fk SET new_foreign_key(***_uuid) = t_ori.new_primary_key(uuid) 
-- FROM table_ori t_ori WHERE t_ori.old_primary_key(id) = t_fk.old_foreign_key;

ALTER TABLE "memberships" ADD COLUMN "organization_id_uuid" uuid;
UPDATE "memberships" t_fk SET organization_id_uuid = t_ori.uuid
FROM "organizations" t_ori WHERE t_ori.id = t_fk.organization_id;

ALTER TABLE "memberships" ADD COLUMN "workspace_id_uuid" uuid;
UPDATE "memberships" t_fk SET workspace_id_uuid = t_ori.uuid
FROM "workspaces" t_ori WHERE t_ori.id = t_fk.workspace_id;

ALTER TABLE "memberships" ADD COLUMN "user_id_uuid" uuid;
UPDATE "memberships" t_fk SET user_id_uuid = t_ori.uuid
FROM "users" t_ori WHERE t_ori.id = t_fk.user_id;

ALTER TABLE "memberships" ADD COLUMN "created_by_uuid" uuid;
UPDATE "memberships" t_fk SET created_by_uuid = t_ori.uuid
FROM "users" t_ori WHERE t_ori.id = t_fk.created_by;

ALTER TABLE "memberships" ADD COLUMN "modified_by_uuid" uuid;
UPDATE "memberships" t_fk SET modified_by_uuid = t_ori.uuid
FROM "users" t_ori WHERE t_ori.id = t_fk.modified_by;

ALTER TABLE "oauth_accounts" ADD COLUMN "user_id_uuid" uuid;
UPDATE "oauth_accounts" t_fk SET user_id_uuid = t_ori.uuid
FROM "users" t_ori WHERE t_ori.id = t_fk.user_id;

ALTER TABLE "organizations" ADD COLUMN "created_by_uuid" uuid;
UPDATE "organizations" t_fk SET created_by_uuid = t_ori.uuid
FROM "users" t_ori WHERE t_ori.id = t_fk.created_by;

ALTER TABLE "organizations" ADD COLUMN "modified_by_uuid" uuid;
UPDATE "organizations" t_fk SET modified_by_uuid = t_ori.uuid
FROM "users" t_ori WHERE t_ori.id = t_fk.modified_by;

ALTER TABLE "sessions" ADD COLUMN "user_id_uuid" uuid;
UPDATE "sessions" t_fk SET user_id_uuid = t_ori.uuid
FROM "users" t_ori WHERE t_ori.id = t_fk.user_id;

ALTER TABLE "tokens" ADD COLUMN "user_id_uuid" uuid;
UPDATE "tokens" t_fk SET user_id_uuid = t_ori.uuid
FROM "users" t_ori WHERE t_ori.id = t_fk.user_id;

ALTER TABLE "tokens" ADD COLUMN "organization_id_uuid" uuid;
UPDATE "tokens" t_fk SET organization_id_uuid = t_ori.uuid
FROM "organizations" t_ori WHERE t_ori.id = t_fk.organization_id;

ALTER TABLE "users" ADD COLUMN "modified_by_uuid" uuid;
UPDATE "users" t_fk SET modified_by_uuid = t_ori.uuid
FROM "users" t_ori WHERE t_ori.id = t_fk.modified_by;

ALTER TABLE "workspaces" ADD COLUMN "organization_id_uuid" uuid;
UPDATE "workspaces" t_fk SET organization_id_uuid = t_ori.uuid
FROM "organizations" t_ori WHERE t_ori.id = t_fk.organization_id;

ALTER TABLE "workspaces" ADD COLUMN "created_by_uuid" uuid;
UPDATE "workspaces" t_fk SET created_by_uuid = t_ori.uuid
FROM "users" t_ori WHERE t_ori.id = t_fk.created_by;

ALTER TABLE "workspaces" ADD COLUMN "modified_by_uuid" uuid;
UPDATE "workspaces" t_fk SET modified_by_uuid = t_ori.uuid
FROM "users" t_ori WHERE t_ori.id = t_fk.modified_by;


-- Rename the PK & FK columns to old_***
ALTER TABLE "memberships" RENAME COLUMN "id" TO "old_id";
ALTER TABLE "memberships" RENAME COLUMN "organization_id" TO "old_organization_id";
ALTER TABLE "memberships" RENAME COLUMN "workspace_id" TO "old_workspace_id";
ALTER TABLE "memberships" RENAME COLUMN "user_id" TO "old_user_id";
ALTER TABLE "memberships" RENAME COLUMN "created_by" TO "old_created_by";
ALTER TABLE "memberships" RENAME COLUMN "modified_by" TO "old_modified_by";

ALTER TABLE "oauth_accounts" RENAME COLUMN "user_id" TO "old_user_id";

ALTER TABLE "organizations" RENAME COLUMN "id" TO "old_id";
ALTER TABLE "organizations" RENAME COLUMN "created_by" TO "old_created_by";
ALTER TABLE "organizations" RENAME COLUMN "modified_by" TO "old_modified_by";

ALTER TABLE "sessions" RENAME COLUMN "id" TO "old_id";
ALTER TABLE "sessions" RENAME COLUMN "user_id" TO "old_user_id";

ALTER TABLE "tokens" RENAME COLUMN "id" TO "old_id";
ALTER TABLE "tokens" RENAME COLUMN "user_id" TO "old_user_id";
ALTER TABLE "tokens" RENAME COLUMN "organization_id" TO "old_organization_id";

ALTER TABLE "users" RENAME COLUMN "id" TO "old_id";
ALTER TABLE "users" RENAME COLUMN "modified_by" TO "old_modified_by";

ALTER TABLE "workspaces" RENAME COLUMN "id" TO "old_id";
ALTER TABLE "workspaces" RENAME COLUMN "organization_id" TO "old_organization_id";
ALTER TABLE "workspaces" RENAME COLUMN "created_by" TO "old_created_by";
ALTER TABLE "workspaces" RENAME COLUMN "modified_by" TO "old_modified_by";


-- Rename the UUID PK & FK columns to new name.
ALTER TABLE "memberships" RENAME COLUMN "uuid" TO "id";
ALTER TABLE "memberships" RENAME COLUMN "organization_id_uuid" TO "organization_id";
ALTER TABLE "memberships" RENAME COLUMN "workspace_id_uuid" TO "workspace_id";
ALTER TABLE "memberships" RENAME COLUMN "user_id_uuid" TO "user_id";
ALTER TABLE "memberships" RENAME COLUMN "created_by_uuid" TO "created_by";
ALTER TABLE "memberships" RENAME COLUMN "modified_by_uuid" TO "modified_by";

ALTER TABLE "oauth_accounts" RENAME COLUMN "user_id_uuid" TO "user_id";

ALTER TABLE "organizations" RENAME COLUMN "uuid" TO "id";
ALTER TABLE "organizations" RENAME COLUMN "created_by_uuid" TO "created_by";
ALTER TABLE "organizations" RENAME COLUMN "modified_by_uuid" TO "modified_by";

ALTER TABLE "sessions" RENAME COLUMN "uuid" TO "id";
ALTER TABLE "sessions" RENAME COLUMN "user_id_uuid" TO "user_id";

ALTER TABLE "tokens" RENAME COLUMN "uuid" TO "id";
ALTER TABLE "tokens" RENAME COLUMN "user_id_uuid" TO "user_id";
ALTER TABLE "tokens" RENAME COLUMN "organization_id_uuid" TO "organization_id";

ALTER TABLE "users" RENAME COLUMN "uuid" TO "id";
ALTER TABLE "users" RENAME COLUMN "modified_by_uuid" TO "modified_by";

ALTER TABLE "workspaces" RENAME COLUMN "uuid" TO "id";
ALTER TABLE "workspaces" RENAME COLUMN "organization_id_uuid" TO "organization_id";
ALTER TABLE "workspaces" RENAME COLUMN "created_by_uuid" TO "created_by";
ALTER TABLE "workspaces" RENAME COLUMN "modified_by_uuid" TO "modified_by";


-- Remove all FK constraints

ALTER TABLE "memberships" DROP CONSTRAINT "memberships_organization_id_organizations_id_fk";
ALTER TABLE "memberships" DROP CONSTRAINT "memberships_workspace_id_workspaces_id_fk";
ALTER TABLE "memberships" DROP CONSTRAINT "memberships_user_id_users_id_fk";
ALTER TABLE "memberships" DROP CONSTRAINT "memberships_created_by_users_id_fk";
ALTER TABLE "memberships" DROP CONSTRAINT "memberships_modified_by_users_id_fk";

ALTER TABLE "oauth_accounts" DROP CONSTRAINT "oauth_accounts_user_id_users_id_fk";

ALTER TABLE "organizations" DROP CONSTRAINT "organizations_created_by_users_id_fk";
ALTER TABLE "organizations" DROP CONSTRAINT "organizations_modified_by_users_id_fk";

ALTER TABLE "sessions" DROP CONSTRAINT "sessions_user_id_users_id_fk";

ALTER TABLE "tokens" DROP CONSTRAINT "tokens_user_id_users_id_fk";
ALTER TABLE "tokens" DROP CONSTRAINT "tokens_organization_id_organizations_id_fk";

ALTER TABLE "users" DROP CONSTRAINT "users_modified_by_users_id_fk";

ALTER TABLE "workspaces" DROP CONSTRAINT "workspaces_organization_id_organizations_id_fk";
ALTER TABLE "workspaces" DROP CONSTRAINT "workspaces_created_by_users_id_fk";
ALTER TABLE "workspaces" DROP CONSTRAINT "workspaces_modified_by_users_id_fk";


-- Remove old PK constraints. Note: must behind "Remove all FK constraints"
ALTER TABLE "memberships" DROP CONSTRAINT "memberships_pkey";
ALTER TABLE "oauth_accounts" DROP CONSTRAINT "oauth_accounts_provider_id_provider_user_id_pk";
ALTER TABLE "organizations" DROP CONSTRAINT "organizations_pkey";
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_pkey";
ALTER TABLE "tokens" DROP CONSTRAINT "tokens_pkey";
ALTER TABLE "users" DROP CONSTRAINT "users_pkey";
ALTER TABLE "workspaces" DROP CONSTRAINT "workspaces_pkey";


-- set the UUID columns as primary key
ALTER TABLE "memberships" ADD PRIMARY KEY (id);
ALTER TABLE "oauth_accounts" ADD PRIMARY KEY (provider_id, provider_user_id);
ALTER TABLE "organizations" ADD PRIMARY KEY (id);
ALTER TABLE "sessions" ADD PRIMARY KEY (id);
ALTER TABLE "tokens" ADD PRIMARY KEY (id);
ALTER TABLE "users" ADD PRIMARY KEY (id);
ALTER TABLE "workspaces" ADD PRIMARY KEY (id);


-- set new FK constraints. (Just copy from first migrate sql file.)
DO $$ BEGIN
 ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "memberships" ADD CONSTRAINT "memberships_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "memberships" ADD CONSTRAINT "memberships_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "memberships" ADD CONSTRAINT "memberships_modified_by_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "organizations" ADD CONSTRAINT "organizations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "organizations" ADD CONSTRAINT "organizations_modified_by_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tokens" ADD CONSTRAINT "tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tokens" ADD CONSTRAINT "tokens_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_modified_by_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_modified_by_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;


-- (optional) delete the old varchar columns

ALTER TABLE "memberships" DROP COLUMN "old_id";
ALTER TABLE "memberships" DROP COLUMN "old_organization_id";
ALTER TABLE "memberships" DROP COLUMN "old_workspace_id";
ALTER TABLE "memberships" DROP COLUMN "old_user_id";
ALTER TABLE "memberships" DROP COLUMN "old_created_by";
ALTER TABLE "memberships" DROP COLUMN "old_modified_by";

ALTER TABLE "oauth_accounts" DROP COLUMN "old_user_id";

ALTER TABLE "organizations" DROP COLUMN "old_id";
ALTER TABLE "organizations" DROP COLUMN "old_created_by";
ALTER TABLE "organizations" DROP COLUMN "old_modified_by";

ALTER TABLE "sessions" DROP COLUMN "old_id";
ALTER TABLE "sessions" DROP COLUMN "old_user_id";

ALTER TABLE "tokens" DROP COLUMN "old_id";
ALTER TABLE "tokens" DROP COLUMN "old_user_id";
ALTER TABLE "tokens" DROP COLUMN "old_organization_id";

ALTER TABLE "users" DROP COLUMN "old_id";
ALTER TABLE "users" DROP COLUMN "old_modified_by";

ALTER TABLE "workspaces" DROP COLUMN "old_id";
ALTER TABLE "workspaces" DROP COLUMN "old_organization_id";
ALTER TABLE "workspaces" DROP COLUMN "old_created_by";
ALTER TABLE "workspaces" DROP COLUMN "old_modified_by";


