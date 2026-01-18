import { OpenAPIHono } from '@hono/zod-openapi';
import { appConfig } from 'config';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '#/db/db';
import { deploymentsTable } from '#/db/schema/deployments';
import { repositoriesTable } from '#/db/schema/repositories';
import { type Env, getContextOrganization, getContextUser } from '#/lib/context';
import { AppError } from '#/lib/error';
import { createWebhook, deleteWebhook, generateWebhookSecret, listUserRepos } from '#/lib/github';
import { getGitHubAccessToken } from '#/lib/oauth-token';
import { generateBucketName, generateDefaultDomain } from '#/lib/scaleway';
import repositoriesRoutes from '#/modules/repositories/repositories-routes';
import { getValidProductEntity } from '#/permissions/get-product-entity';
import { defaultHook } from '#/utils/default-hook';
import { getIsoDate } from '#/utils/iso-date';
import { logEvent } from '#/utils/logger';

const app = new OpenAPIHono<Env>({ defaultHook });

const repositoriesRouteHandlers = app
  /**
   * List user's available GitHub repositories
   */
  .openapi(repositoriesRoutes.listGithubRepos, async (ctx) => {
    const user = getContextUser();
    const { page, perPage } = ctx.req.valid('query');

    // Get the user's GitHub access token
    const accessToken = await getGitHubAccessToken(user.id);

    const repos = await listUserRepos(accessToken, {
      page,
      perPage,
      sort: 'updated',
    });

    return ctx.json(repos, 200);
  })

  /**
   * Connect a GitHub repository
   */
  .openapi(repositoriesRoutes.connectRepository, async (ctx) => {
    const user = getContextUser();
    const organization = getContextOrganization();
    const body = ctx.req.valid('json');

    // Check if repository is already connected
    const [existingRepo] = await db
      .select()
      .from(repositoriesTable)
      .where(
        and(
          eq(repositoriesTable.githubRepoId, body.githubRepoId),
          eq(repositoriesTable.organizationId, organization.id),
        ),
      );

    if (existingRepo) {
      throw new AppError(409, 'duplicate_creation', 'warn', {
        message: 'This repository is already connected to this organization.',
      });
    }

    // Get GitHub access token for webhook creation
    const accessToken = await getGitHubAccessToken(user.id);

    // Generate webhook secret
    const webhookSecret = generateWebhookSecret();

    // Create webhook on GitHub
    const webhookUrl = `${appConfig.backendUrl}/webhooks/github`;

    let webhookId: number | null = null;
    try {
      const webhook = await createWebhook(
        accessToken,
        body.githubOwner,
        body.githubRepoName,
        webhookUrl,
        webhookSecret,
        ['release', 'workflow_run'],
      );
      webhookId = webhook.id;
    } catch (error) {
      logEvent('warn', 'Failed to create GitHub webhook', { error });
      // Continue without webhook - user can add manually later
    }

    // Generate bucket name and default domain
    const repositoryId = crypto.randomUUID().slice(0, 12);
    const s3BucketName = generateBucketName(repositoryId);
    const defaultDomain = generateDefaultDomain(repositoryId);

    // Create repository record
    const [repository] = await db
      .insert(repositoriesTable)
      .values({
        id: repositoryId,
        organizationId: organization.id,
        name: body.name || body.githubRepoName,
        description: body.description || `Hosting for ${body.githubFullName}`,
        keywords: `${body.githubOwner},${body.githubRepoName},hosting`,
        githubRepoId: body.githubRepoId,
        githubRepoName: body.githubRepoName,
        githubOwner: body.githubOwner,
        githubFullName: body.githubFullName,
        githubDefaultBranch: body.githubDefaultBranch,
        branch: body.branch,
        buildArtifactPath: body.buildArtifactPath,
        s3BucketName,
        defaultDomain,
        webhookId,
        webhookSecret,
        createdBy: user.id,
        modifiedBy: user.id,
      })
      .returning();

    logEvent('info', 'Repository connected', {
      repositoryId: repository.id,
      githubRepo: body.githubFullName,
    });

    // Don't return webhook secret in response
    const { webhookSecret: _, ...safeRepository } = repository;

    return ctx.json({ ...safeRepository, webhookSecret: null }, 201);
  })

  /**
   * List repositories for an organization
   */
  .openapi(repositoriesRoutes.listRepositories, async (ctx) => {
    const organization = getContextOrganization();
    const { limit, offset } = ctx.req.valid('query');

    // Get repositories with latest deployment
    const repositories = await db
      .select()
      .from(repositoriesTable)
      .where(eq(repositoriesTable.organizationId, organization.id))
      .orderBy(desc(repositoriesTable.createdAt))
      .limit(limit ?? 50)
      .offset(offset ?? 0);

    // Get deployment stats for each repository
    const repositoriesWithStats = await Promise.all(
      repositories.map(async (repo) => {
        const [lastDeployment] = await db
          .select()
          .from(deploymentsTable)
          .where(eq(deploymentsTable.repositoryId, repo.id))
          .orderBy(desc(deploymentsTable.createdAt))
          .limit(1);

        return {
          ...repo,
          webhookSecret: null, // Don't expose webhook secret
          lastDeployment: lastDeployment
            ? {
                id: lastDeployment.id,
                status: lastDeployment.status,
                commitSha: lastDeployment.commitSha,
                createdAt: lastDeployment.createdAt,
              }
            : null,
        };
      }),
    );

    return ctx.json(repositoriesWithStats, 200);
  })

  /**
   * Get a repository by ID
   */
  .openapi(repositoriesRoutes.getRepository, async (ctx) => {
    const { id } = ctx.req.valid('param');

    await getValidProductEntity(id, 'repository', 'read');

    const [repository] = await db.select().from(repositoriesTable).where(eq(repositoriesTable.id, id));

    if (!repository) {
      throw new AppError(404, 'resource_not_found', 'warn', { entityType: 'repository' });
    }

    return ctx.json({ ...repository, webhookSecret: null }, 200);
  })

  /**
   * Update repository settings
   */
  .openapi(repositoriesRoutes.updateRepository, async (ctx) => {
    const { id } = ctx.req.valid('param');
    const body = ctx.req.valid('json');

    await getValidProductEntity(id, 'repository', 'update');

    const user = getContextUser();

    const [updatedRepository] = await db
      .update(repositoriesTable)
      .set({
        ...body,
        modifiedAt: getIsoDate(),
        modifiedBy: user.id,
      })
      .where(eq(repositoriesTable.id, id))
      .returning();

    logEvent('info', 'Repository updated', { repositoryId: id });

    return ctx.json({ ...updatedRepository, webhookSecret: null }, 200);
  })

  /**
   * Disconnect (delete) a repository
   */
  .openapi(repositoriesRoutes.disconnectRepository, async (ctx) => {
    const { id } = ctx.req.valid('param');

    await getValidProductEntity(id, 'repository', 'delete');

    const user = getContextUser();

    // Get repository to delete webhook
    const [repository] = await db.select().from(repositoriesTable).where(eq(repositoriesTable.id, id));

    if (!repository) {
      throw new AppError(404, 'resource_not_found', 'warn', { entityType: 'repository' });
    }

    // Try to delete GitHub webhook
    if (repository.webhookId && repository.webhookSecret) {
      try {
        const accessToken = await getGitHubAccessToken(user.id);
        await deleteWebhook(accessToken, repository.githubOwner, repository.githubRepoName, repository.webhookId);
      } catch (error) {
        logEvent('warn', 'Failed to delete GitHub webhook', { error, repositoryId: id });
        // Continue with deletion even if webhook removal fails
      }
    }

    // TODO: Clean up Scaleway resources (S3 bucket, Edge pipeline)

    // Delete repository (cascades to deployments and domains)
    await db.delete(repositoriesTable).where(eq(repositoriesTable.id, id));

    logEvent('info', 'Repository disconnected', { repositoryId: id });

    return ctx.json({ success: true }, 200);
  })

  /**
   * Trigger a manual deployment
   */
  .openapi(repositoriesRoutes.triggerDeployment, async (ctx) => {
    const { id } = ctx.req.valid('param');
    const body = ctx.req.valid('json');

    await getValidProductEntity(id, 'repository', 'update');

    const user = getContextUser();

    const [repository] = await db.select().from(repositoriesTable).where(eq(repositoriesTable.id, id));

    if (!repository) {
      throw new AppError(404, 'resource_not_found', 'warn', { entityType: 'repository' });
    }

    // Create a new deployment record
    const [deployment] = await db
      .insert(deploymentsTable)
      .values({
        repositoryId: id,
        name: `Deployment for ${repository.githubFullName}`,
        commitSha: body?.commitSha || 'manual',
        branch: repository.branch,
        status: 'pending',
        artifactSource: body?.source || 'release',
        triggeredBy: user.id,
        logs: [
          {
            timestamp: new Date().toISOString(),
            level: 'info',
            message: 'Deployment triggered manually',
          },
        ],
      })
      .returning();

    logEvent('info', 'Manual deployment triggered', {
      repositoryId: id,
      deploymentId: deployment.id,
    });

    // Deployment worker will automatically pick up pending deployments

    return ctx.json(
      {
        deploymentId: deployment.id,
        status: deployment.status,
      },
      201,
    );
  });

export default repositoriesRouteHandlers;
