import { OpenAPIHono } from '@hono/zod-openapi';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '#/db/db';
import { type DeploymentLogEntry, type DeploymentStatus, deploymentsTable } from '#/db/schema/deployments';
import { repositoriesTable } from '#/db/schema/repositories';
import { type Env, getContextUser } from '#/lib/context';
import { AppError } from '#/lib/error';
import deploymentsRoutes from '#/modules/deployments/deployments-routes';
import { defaultHook } from '#/utils/default-hook';
import { logEvent } from '#/utils/logger';

const app = new OpenAPIHono<Env>({ defaultHook });

/**
 * List all deployments with optional filters
 */
app.openapi(deploymentsRoutes.listDeployments, async (ctx) => {
  const { limit, offset, status, repositoryId } = ctx.req.valid('query');

  const conditions = [];
  if (status) conditions.push(eq(deploymentsTable.status, status as DeploymentStatus));
  if (repositoryId) conditions.push(eq(deploymentsTable.repositoryId, repositoryId as string));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const deployments = await db
    .select()
    .from(deploymentsTable)
    .where(whereClause)
    .orderBy(desc(deploymentsTable.createdAt))
    .limit(Number(limit ?? 50))
    .offset(Number(offset ?? 0));

  // Get total count
  const [countResult] = await db
    .select({ count: db.$count(deploymentsTable) })
    .from(deploymentsTable)
    .where(whereClause);

  return ctx.json(
    {
      items: deployments.map(toDeploymentResponse),
      total: countResult?.count ?? 0,
    },
    200,
  );
});

/**
 * Get a specific deployment with repository info
 */
app.openapi(deploymentsRoutes.getDeployment, async (ctx) => {
  const { deploymentId } = ctx.req.valid('param');

  const [result] = await db
    .select({
      deployment: deploymentsTable,
      repository: {
        id: repositoriesTable.id,
        githubFullName: repositoriesTable.githubFullName,
        defaultDomain: repositoriesTable.defaultDomain,
      },
    })
    .from(deploymentsTable)
    .innerJoin(repositoriesTable, eq(deploymentsTable.repositoryId, repositoriesTable.id))
    .where(eq(deploymentsTable.id, deploymentId));

  if (!result) {
    throw new AppError(404, 'not_found', 'warn');
  }

  return ctx.json(
    {
      ...toDeploymentResponse(result.deployment),
      repository: result.repository,
    },
    200,
  );
});

/**
 * Trigger a new deployment for a repository
 */
app.openapi(deploymentsRoutes.triggerDeployment, async (ctx) => {
  const { repositoryId } = ctx.req.valid('param');
  const body = ctx.req.valid('json');
  const user = getContextUser();

  // Get repository
  const [repository] = await db.select().from(repositoriesTable).where(eq(repositoriesTable.id, repositoryId));

  if (!repository) {
    throw new AppError(404, 'not_found', 'warn');
  }

  // Create a new deployment record
  const [deployment] = await db
    .insert(deploymentsTable)
    .values({
      name: `Deployment ${new Date().toISOString()}`,
      repositoryId,
      branch: body.branch ?? repository.branch,
      commitSha: '', // Will be populated by deployment service
      artifactSource: body.artifactSource,
      status: 'pending',
      triggeredBy: user?.id,
      logs: [createLogEntry('info', 'Deployment triggered', { source: body.artifactSource, triggeredBy: user?.email })],
    })
    .returning();

  logEvent('info', 'Deployment triggered', {
    deploymentId: deployment.id,
    repositoryId,
    artifactSource: body.artifactSource,
    triggeredBy: user?.email,
  });

  // Deployment worker will automatically pick up pending deployments
  // and process them asynchronously

  return ctx.json(toDeploymentResponse(deployment), 200);
});

/**
 * Rollback to a previous deployment
 */
app.openapi(deploymentsRoutes.rollbackDeployment, async (ctx) => {
  const { repositoryId } = ctx.req.valid('param');
  const { deploymentId } = ctx.req.valid('json');
  const user = getContextUser();

  // Get the target deployment
  const [targetDeployment] = await db
    .select()
    .from(deploymentsTable)
    .where(and(eq(deploymentsTable.id, deploymentId), eq(deploymentsTable.repositoryId, repositoryId)));

  if (!targetDeployment) {
    throw new AppError(404, 'not_found', 'warn');
  }

  if (targetDeployment.status !== 'deployed') {
    throw new AppError(403, 'forbidden', 'warn');
  }

  // Deactivate current active deployment
  await db
    .update(deploymentsTable)
    .set({ isActive: false })
    .where(and(eq(deploymentsTable.repositoryId, repositoryId), eq(deploymentsTable.isActive, true)));

  // Activate the target deployment
  const [rolledBackDeployment] = await db
    .update(deploymentsTable)
    .set({
      isActive: true,
      status: 'deployed', // Keep as deployed
      logs: [
        ...(targetDeployment.logs ?? []),
        createLogEntry('info', 'Rolled back to this deployment', { triggeredBy: user?.email }),
      ],
    })
    .where(eq(deploymentsTable.id, deploymentId))
    .returning();

  logEvent('info', 'Deployment rolled back', {
    deploymentId,
    repositoryId,
    triggeredBy: user?.email,
  });

  // TODO: Update Edge Services to point to the rolled-back S3 path

  return ctx.json(toDeploymentResponse(rolledBackDeployment), 200);
});

/**
 * Cancel a pending deployment
 */
app.openapi(deploymentsRoutes.cancelDeployment, async (ctx) => {
  const { deploymentId } = ctx.req.valid('param');
  const user = getContextUser();

  const [deployment] = await db.select().from(deploymentsTable).where(eq(deploymentsTable.id, deploymentId));

  if (!deployment) {
    throw new AppError(404, 'not_found', 'warn');
  }

  const cancellableStatuses = ['pending', 'downloading', 'uploading'];
  if (!cancellableStatuses.includes(deployment.status)) {
    throw new AppError(403, 'forbidden', 'warn');
  }

  await db
    .update(deploymentsTable)
    .set({
      status: 'failed',
      errorMessage: 'Cancelled by user',
      logs: [...(deployment.logs ?? []), createLogEntry('warn', 'Deployment cancelled by user', { user: user?.email })],
    })
    .where(eq(deploymentsTable.id, deploymentId));

  logEvent('info', 'Deployment cancelled', { deploymentId, cancelledBy: user?.email });

  return ctx.json({ success: true }, 200);
});

/**
 * Get deployment logs with optional filtering
 */
app.openapi(deploymentsRoutes.getDeploymentLogs, async (ctx) => {
  const { deploymentId } = ctx.req.valid('param');
  const { level, after } = ctx.req.valid('query');

  const [deployment] = await db.select().from(deploymentsTable).where(eq(deploymentsTable.id, deploymentId));

  if (!deployment) {
    throw new AppError(404, 'not_found', 'warn');
  }

  let logs = deployment.logs ?? [];

  // Filter by level if specified
  if (level) {
    logs = logs.filter((log) => log.level === level);
  }

  // Filter by timestamp if specified
  if (after) {
    const afterDate = new Date(after);
    logs = logs.filter((log) => new Date(log.timestamp) > afterDate);
  }

  return ctx.json({ deploymentId, logs }, 200);
});

/**
 * Create a log entry for deployment logs
 */
function createLogEntry(
  level: DeploymentLogEntry['level'],
  message: string,
  metadata?: Record<string, unknown>,
): DeploymentLogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    metadata,
  };
}

/**
 * Transform deployment model to API response
 */
function toDeploymentResponse(deployment: typeof deploymentsTable.$inferSelect) {
  return {
    id: deployment.id,
    commitSha: deployment.commitSha,
    branch: deployment.branch,
    status: deployment.status,
    isActive: deployment.isActive,
    artifactSource: deployment.artifactSource,
    artifactId: deployment.artifactUrl, // Using artifactUrl as ID for now
    s3Path: deployment.s3Path,
    deployedUrl: deployment.deployedUrl,
    logs: deployment.logs ?? [],
    triggeredBy: deployment.triggeredBy,
    repositoryId: deployment.repositoryId,
    createdAt: deployment.createdAt,
    modifiedAt: deployment.modifiedAt,
  };
}

export default app;
