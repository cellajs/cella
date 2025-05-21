import { env } from '../../env';

/**
 * Novu configuration for sending Slack messages.
 * @link https://docs.novu.co/platform/integrations/chat/slack
 * Due to `@novu/node` not supported from March 20, 2025
 *
 * Create workflow in Novu dashboard and set the workflow ID here.
 * Add to workflow trigger `Chat Step` with following template:
 * ```
 * {{payload.prefix}} request from {{payload.email}}
 * ```
 * Subscriber you will create from sendSlackMessage, so just set desired subscriber ID here.
 */
export const novuConfig = {
  secretKey: env.NOVU_API_KEY,
  serverURL: 'https://eu.api.novu.co',
  slackWebhookUrl: env.NOVU_SLACK_WEBHOOK,
  workflowId: 'cella-slack',
  subscriberId: 'slack-contact-form-subscriber',
};
