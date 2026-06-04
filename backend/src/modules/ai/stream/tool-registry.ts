import { z } from '@hono/zod-openapi';
import { type ServerTool, toolDefinition } from '@tanstack/ai';
import type { AuthContext } from '#/core/context';
import { getTaskOp } from '#/modules/task/operations/get-task';
import { getTasksOp } from '#/modules/task/operations/get-tasks';

export function buildTools(ctx: AuthContext): ServerTool[] {
  const getTasksTool = toolDefinition({
    name: 'getTasks',
    description:
      'Search tasks by keyword, status, label, or project. Returns matching task summaries with status and assignees.',
    inputSchema: z.object({
      projectId: z.string().optional().describe('Filter by project ID'),
      workspaceId: z.string().optional().describe('Filter by workspace ID'),
      q: z.string().optional().describe('Search keyword'),
      sort: z
        .enum(['projectId', 'status', 'createdBy', 'variant', 'updatedAt', 'createdAt'])
        .optional()
        .describe('Sort field'),
      order: z.enum(['asc', 'desc']).optional().describe('Sort order'),
      limit: z.number().optional().describe('Max results to return (default 50)'),
      offset: z.number().optional().describe('Pagination offset'),
    }),
  }).server(async (input) => {
    const result = await getTasksOp(ctx, { ...input, limit: input.limit ?? 50, offset: input.offset ?? 0 });
    if (!result.success) return { error: 'Failed to fetch tasks' };
    return result.data;
  });

  const getTaskTool = toolDefinition({
    name: 'getTask',
    description: 'Get full task details including description, labels, and assignees.',
    inputSchema: z.object({
      id: z.string().describe('The task ID to retrieve'),
    }),
  }).server(async (input) => {
    const result = await getTaskOp(ctx, input.id);
    if (!result.success) return { error: 'Task not found' };
    return result.data;
  });

  return [getTasksTool, getTaskTool];
}
