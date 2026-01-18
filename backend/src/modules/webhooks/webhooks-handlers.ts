import { OpenAPIHono } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import type { z } from 'zod';
import { db } from '#/db/db';
import { deploymentsTable } from '#/db/schema/deployments';
import { repositoriesTable } from '#/db/schema/repositories';
import type { Env } from '#/lib/context';
import { AppError } from '#/lib/error';
import { verifyWebhookSignature } from '#/lib/github';
import webhooksRoutes from '#/modules/webhooks/webhooks-routes';
import { githubReleasePayloadSchema, githubWorkflowRunPayloadSchema } from '#/modules/webhooks/webhooks-schema';
import { defaultHook } from '#/utils/default-hook';
import { logEvent } from '#/utils/logger';
import { nanoid } from '#/utils/nanoid';

type GithubReleasePayload = z.infer<typeof githubReleasePayloadSchema>;
type GithubWorkflowRunPayload = z.infer<typeof githubWorkflowRunPayloadSchema>;

const app = new OpenAPIHono<Env>({ defaultHook });

/**
 * Receive and process GitHub webhook events
 */
app.openapi(webhooksRoutes.receiveGithubWebhook, async (ctx) => {
  const { repositoryId } = ctx.req.valid('param');
  const rawBody = await ctx.req.text();
  const githubEvent = ctx.req.header('x-github-event');
  const githubDelivery = ctx.req.header('x-github-delivery');
  const signature = ctx.req.header('x-hub-signature-256');

  // Validate required headers
  if (!githubEvent || !signature) {
    logEvent('warn', 'Webhook missing required headers', { repositoryId, githubEvent });
    return ctx.json({ received: true, processed: false, message: 'Missing required headers' }, 200);
  }

  // Get repository and verify it exists
  const [repository] = await db.select().from(repositoriesTable).where(eq(repositoriesTable.id, repositoryId));

  if (!repository) {
    logEvent('warn', 'Webhook received for unknown repository', { repositoryId });
    return ctx.json({ received: true, processed: false, message: 'Repository not found' }, 200);
  }

  // Verify webhook signature
  if (!repository.webhookSecret) {
    logEvent('warn', 'Repository has no webhook secret', { repositoryId });
    return ctx.json({ received: true, processed: false, message: 'Webhook not configured' }, 200);
  }

  const isValidSignature = verifyWebhookSignature(rawBody, signature, repository.webhookSecret);
  if (!isValidSignature) {
    logEvent('warn', 'Webhook signature verification failed', { repositoryId, githubDelivery });
    throw new AppError(403, 'forbidden', 'warn');
  }

  logEvent('info', 'GitHub webhook received', {
    repositoryId,
    event: githubEvent,
    delivery: githubDelivery,
  });

  // Parse payload
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    logEvent('warn', 'Failed to parse webhook payload', { repositoryId });
    return ctx.json({ received: true, processed: false, message: 'Invalid JSON payload' }, 200);
  }

  // Handle different event types
  switch (githubEvent) {
    case 'release': {
      const result = githubReleasePayloadSchema.safeParse(payload);
      if (!result.success) {
        logEvent('warn', 'Invalid release payload', { repositoryId, errors: result.error.issues });
        return ctx.json({ received: true, processed: false, message: 'Invalid release payload' }, 200);
      }
      await handleReleaseEvent(repositoryId, result.data);
      break;
    }

    case 'workflow_run': {
      const result = githubWorkflowRunPayloadSchema.safeParse(payload);
      if (!result.success) {
        logEvent('warn', 'Invalid workflow_run payload', { repositoryId, errors: result.error.issues });
        return ctx.json({ received: true, processed: false, message: 'Invalid workflow_run payload' }, 200);
      }
      await handleWorkflowRunEvent(repositoryId, result.data);
      break;
    }

    case 'ping': {
      logEvent('info', 'GitHub ping event received', { repositoryId });
      return ctx.json({ received: true, processed: true, message: 'Pong!' }, 200);
    }

    default: {
      logEvent('info', 'Unhandled webhook event type', { repositoryId, event: githubEvent });
      return ctx.json({ received: true, processed: false, message: `Event type '${githubEvent}' not handled` }, 200);
    }
  }

  return ctx.json({ received: true, processed: true, message: 'Webhook processed' }, 200);
});

/**
 * Handle GitHub release events
 * Triggers deployment when a new release is published.
 */
async function handleReleaseEvent(repositoryId: string, payload: GithubReleasePayload): Promise<void> {
  // Only deploy on published releases
  if (payload.action !== 'published') {
    logEvent('info', 'Release event ignored (not published)', { repositoryId, action: payload.action });
    return;
  }

  const release = payload.release;
  logEvent('info', 'Processing release event', {
    repositoryId,
    releaseTag: release.tag_name,
    releaseName: release.name,
    assetCount: release.assets.length,
  });

  // Create deployment record (worker will pick it up)
  const [deployment] = await db
    .insert(deploymentsTable)
    .values({
      id: nanoid(),
      name: `Release: ${release.tag_name}`,
      repositoryId,
      commitSha: release.target_commitish ?? 'unknown',
      commitMessage: `Release: ${release.name || release.tag_name}`,
      branch: release.target_commitish ?? 'main',
      status: 'pending',
      artifactSource: 'release',
      artifactUrl: release.tag_name,
      logs: [
        {
          timestamp: new Date().toISOString(),
          level: 'info',
          message: `Deployment triggered by release: ${release.tag_name}`,
          metadata: { triggeredBy: payload.sender.login },
        },
      ],
    })
    .returning();

  logEvent('info', 'Deployment created for release', {
    repositoryId,
    deploymentId: deployment.id,
    releaseTag: release.tag_name,
    triggeredBy: payload.sender.login,
  });
}

/**
 * Handle GitHub workflow_run events
 * Triggers deployment when a workflow completes successfully.
 */
async function handleWorkflowRunEvent(repositoryId: string, payload: GithubWorkflowRunPayload): Promise<void> {
  const workflowRun = payload.workflow_run;

  // Only deploy on completed successful workflows
  if (payload.action !== 'completed') {
    logEvent('info', 'Workflow run event ignored (not completed)', { repositoryId, action: payload.action });
    return;
  }

  if (workflowRun.conclusion !== 'success') {
    logEvent('info', 'Workflow run event ignored (not successful)', {
      repositoryId,
      conclusion: workflowRun.conclusion,
    });
    return;
  }

  logEvent('info', 'Processing workflow_run event', {
    repositoryId,
    workflowId: workflowRun.id,
    workflowName: workflowRun.name,
    headSha: workflowRun.head_sha,
  });

  // Create deployment record (worker will pick it up)
  const [deployment] = await db
    .insert(deploymentsTable)
    .values({
      id: nanoid(),
      name: `Workflow: ${workflowRun.name}`,
      repositoryId,
      commitSha: workflowRun.head_sha,
      commitMessage: `Workflow: ${workflowRun.name}`,
      branch: workflowRun.head_branch ?? 'main',
      status: 'pending',
      artifactSource: 'workflow',
      artifactUrl: String(workflowRun.id),
      logs: [
        {
          timestamp: new Date().toISOString(),
          level: 'info',
          message: `Deployment triggered by workflow: ${workflowRun.name}`,
          metadata: { triggeredBy: payload.sender.login },
        },
      ],
    })
    .returning();

  logEvent('info', 'Deployment created for workflow run', {
    repositoryId,
    deploymentId: deployment.id,
    workflowRunId: workflowRun.id,
    workflowName: workflowRun.name,
    triggeredBy: payload.sender.login,
  });
}

export default app;
