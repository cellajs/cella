import { eq } from 'drizzle-orm';
import type { AuthContext } from '#/core/context';
import { organizationsTable } from '#/db/schema/organizations';
import { projectsTable } from '#/db/schema/projects';
import { tenantRead } from '#/db/tenant-context';

export async function buildSystemPrompt(ctx: AuthContext): Promise<string> {
  const { organizationId, userId } = ctx.var;

  const { orgName, projects } = await tenantRead(ctx, async (readCtx) => {
    const { db } = readCtx.var;

    const [org] = await db
      .select({ name: organizationsTable.name })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, organizationId))
      .limit(1);

    const projectRows = await db
      .select({ id: projectsTable.id, name: projectsTable.name })
      .from(projectsTable)
      .where(eq(projectsTable.organizationId, organizationId))
      .limit(50);

    return { orgName: org?.name ?? 'Unknown', projects: projectRows };
  });

  const projectList =
    projects.length > 0 ? projects.map((p) => `- ${p.name} (${p.id})`).join('\n') : 'No projects yet.';

  return `You are an AI assistant for the workspace "${orgName}".
The current user ID is "${userId}".

Available projects:
${projectList}

You have access to tools for searching and reading tasks.
Use tools when the user asks about tasks, projects, or work items.
Always cite task IDs when referencing specific tasks.
Keep responses concise and helpful.`;
}
