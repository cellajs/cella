-- Rows whose channel reference names a channel of another tenant. The migration `pnpm generate` writes fails while
-- any count of a keyed column is above 0: the composite keys refuse these rows.
--
-- Run it as admin_role, the table owner: it reads past RLS, where runtime_role sees no product rows and counts 0.
-- One line per pair the app has:
--   product tables: each ancestor column below the organization (`channelRelationColumns`)
--   channel tables below the organization: each of their ancestor columns
--   memberships, invitations, lti_resource_links, lti_contexts: one column per channel type below the organization
--
-- Pattern:
--   SELECT '<table>.<column>' AS ref, count(*) FROM <table> r JOIN <channel table> t ON t.id = r.<column> WHERE t.tenant_id <> r.tenant_id
--
-- Worked example, raak (workspace and project below the organization; tasks, labels and attachments homed in projects).
-- The lines after the keyed pairs count references no key covers, to know their state.

SELECT 'tasks.project_id' AS ref, count(*) FROM tasks r JOIN projects t ON t.id = r.project_id WHERE t.tenant_id <> r.tenant_id
UNION ALL SELECT 'labels.project_id', count(*) FROM labels r JOIN projects t ON t.id = r.project_id WHERE t.tenant_id <> r.tenant_id
UNION ALL SELECT 'attachments.project_id', count(*) FROM attachments r JOIN projects t ON t.id = r.project_id WHERE t.tenant_id <> r.tenant_id
UNION ALL SELECT 'memberships.workspace_id', count(*) FROM memberships r JOIN workspaces t ON t.id = r.workspace_id WHERE t.tenant_id <> r.tenant_id
UNION ALL SELECT 'memberships.project_id', count(*) FROM memberships r JOIN projects t ON t.id = r.project_id WHERE t.tenant_id <> r.tenant_id
UNION ALL SELECT 'invitations.workspace_id', count(*) FROM invitations r JOIN workspaces t ON t.id = r.workspace_id WHERE t.tenant_id <> r.tenant_id
UNION ALL SELECT 'invitations.project_id', count(*) FROM invitations r JOIN projects t ON t.id = r.project_id WHERE t.tenant_id <> r.tenant_id
UNION ALL SELECT 'lti_resource_links.workspace_id', count(*) FROM lti_resource_links r JOIN workspaces t ON t.id = r.workspace_id WHERE t.tenant_id <> r.tenant_id
UNION ALL SELECT 'lti_resource_links.project_id', count(*) FROM lti_resource_links r JOIN projects t ON t.id = r.project_id WHERE t.tenant_id <> r.tenant_id
UNION ALL SELECT 'lti_contexts.workspace_id', count(*) FROM lti_contexts r JOIN workspaces t ON t.id = r.workspace_id WHERE t.tenant_id <> r.tenant_id
UNION ALL SELECT 'lti_contexts.project_id', count(*) FROM lti_contexts r JOIN projects t ON t.id = r.project_id WHERE t.tenant_id <> r.tenant_id
-- Not keyed.
UNION ALL SELECT 'tasks.primary_label_id', count(*) FROM tasks r JOIN labels t ON t.id = r.primary_label_id WHERE t.tenant_id <> r.tenant_id
UNION ALL SELECT 'tasks.labels[]', count(*) FROM tasks r CROSS JOIN LATERAL unnest(r.labels) e(id) JOIN labels t ON t.id::text = e.id WHERE t.tenant_id <> r.tenant_id
UNION ALL SELECT 'tasks.attachments[]', count(*) FROM tasks r CROSS JOIN LATERAL unnest(r.attachments) e(id) JOIN attachments t ON t.id = e.id WHERE t.tenant_id <> r.tenant_id
UNION ALL SELECT 'tasks.merged_from[]', count(*) FROM tasks r CROSS JOIN LATERAL unnest(r.merged_from) e(id) JOIN tasks t ON t.id = e.id WHERE t.tenant_id <> r.tenant_id
UNION ALL SELECT 'memberships.channel_id', count(*) FROM memberships r
  LEFT JOIN organizations o ON r.channel_type = 'organization' AND o.id = r.channel_id
  LEFT JOIN workspaces w ON r.channel_type = 'workspace' AND w.id = r.channel_id
  LEFT JOIN projects p ON r.channel_type = 'project' AND p.id = r.channel_id
  WHERE coalesce(o.tenant_id, w.tenant_id, p.tenant_id) <> r.tenant_id
UNION ALL SELECT 'invitations.channel_id', count(*) FROM invitations r
  LEFT JOIN organizations o ON r.channel_type = 'organization' AND o.id = r.channel_id
  LEFT JOIN workspaces w ON r.channel_type = 'workspace' AND w.id = r.channel_id
  LEFT JOIN projects p ON r.channel_type = 'project' AND p.id = r.channel_id
  WHERE coalesce(o.tenant_id, w.tenant_id, p.tenant_id) <> r.tenant_id;
