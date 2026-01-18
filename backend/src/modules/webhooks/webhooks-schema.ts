import { z } from '@hono/zod-openapi';

/**
 * GitHub webhook event types we handle.
 */
export const webhookEventTypes = ['release', 'workflow_run', 'push'] as const;
export type WebhookEventType = (typeof webhookEventTypes)[number];

/**
 * Base schema for GitHub webhook headers.
 */
export const githubWebhookHeadersSchema = z.object({
  'x-github-event': z.string(),
  'x-github-delivery': z.string(),
  'x-hub-signature-256': z.string().optional(),
});

/**
 * GitHub repository info in webhook payload.
 */
export const githubWebhookRepoSchema = z.object({
  id: z.number(),
  name: z.string(),
  full_name: z.string(),
  owner: z.object({
    login: z.string(),
  }),
  default_branch: z.string(),
});

/**
 * GitHub release webhook payload.
 */
export const githubReleasePayloadSchema = z.object({
  action: z.enum(['published', 'created', 'edited', 'deleted', 'prereleased', 'released']),
  release: z.object({
    id: z.number(),
    tag_name: z.string(),
    target_commitish: z.string().optional(), // Branch or commit SHA the release was created from
    name: z.string().nullable(),
    body: z.string().nullable(),
    draft: z.boolean(),
    prerelease: z.boolean(),
    created_at: z.string(),
    published_at: z.string().nullable(),
    assets: z.array(
      z.object({
        id: z.number(),
        name: z.string(),
        content_type: z.string(),
        size: z.number(),
        browser_download_url: z.string(),
      }),
    ),
  }),
  repository: githubWebhookRepoSchema,
  sender: z.object({
    login: z.string(),
    id: z.number(),
  }),
});

/**
 * GitHub workflow_run webhook payload.
 */
export const githubWorkflowRunPayloadSchema = z.object({
  action: z.enum(['requested', 'completed', 'in_progress']),
  workflow_run: z.object({
    id: z.number(),
    name: z.string().nullable(),
    head_branch: z.string(),
    head_sha: z.string(),
    status: z.string().nullable(),
    conclusion: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
    run_number: z.number(),
    workflow_id: z.number(),
  }),
  workflow: z.object({
    id: z.number(),
    name: z.string(),
    path: z.string(),
  }),
  repository: githubWebhookRepoSchema,
  sender: z.object({
    login: z.string(),
    id: z.number(),
  }),
});

/**
 * GitHub push webhook payload (simplified).
 */
export const githubPushPayloadSchema = z.object({
  ref: z.string(),
  before: z.string(),
  after: z.string(),
  repository: githubWebhookRepoSchema,
  pusher: z.object({
    name: z.string(),
    email: z.string().optional(),
  }),
  head_commit: z
    .object({
      id: z.string(),
      message: z.string(),
      timestamp: z.string(),
      author: z.object({
        name: z.string(),
        email: z.string(),
      }),
    })
    .nullable(),
});

/**
 * Response schema for webhook acknowledgment.
 */
export const webhookAckSchema = z.object({
  received: z.boolean(),
  eventType: z.string(),
  deploymentId: z.string().optional(),
});
