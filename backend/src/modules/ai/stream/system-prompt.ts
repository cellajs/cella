import { eq } from 'drizzle-orm';
import type { AuthContext } from '#/core/context';
import { organizationsTable } from '#/db/schema/organizations';
import { tenantRead } from '#/db/tenant-context';

export async function buildSystemPrompt(ctx: AuthContext): Promise<string> {
  const { organizationId, userId } = ctx.var;

  const orgName = await tenantRead(ctx, async (readCtx) => {
    const { db } = readCtx.var;

    const [org] = await db
      .select({ name: organizationsTable.name })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, organizationId))
      .limit(1);

    return org?.name ?? 'Unknown';
  });

  return `You are an AI assistant for the organization "${orgName}".
The current user ID is "${userId}".

Keep responses concise and helpful.`;
}
