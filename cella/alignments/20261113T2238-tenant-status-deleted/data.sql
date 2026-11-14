-- At the top of the generated migration, before the new keep_organization_admin function: a tenant an organization's
-- deletion archived keeps its place in the removal sweep under the new status.
UPDATE tenants SET status = 'deleted' WHERE status = 'archived';
