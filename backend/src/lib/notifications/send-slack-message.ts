import { Novu } from '@novu/api';
import { ChatOrPushProviderEnum } from '@novu/api/models/components';
import { appConfig } from 'config';
import { novuConfig } from '#/lib/notifications/novu-config';
import { logError, logEvent } from '#/utils/logger';

/**
 * Sends a Slack message via Novu.
 */
export const sendSlackMessage = async (prefix: string, email: string) => {
  try {
    const { secretKey, serverURL, slackWebhookUrl, subscriberId, workflowId } = novuConfig;

    if (!secretKey || !slackWebhookUrl) {
      logEvent('info', 'Missing required Novu appConfig values (API key or Slack webhook).');
      return;
    }

    const novu = new Novu({ secretKey, serverURL });

    // Upsert subscriber to ensure it's created or reused
    await novu.subscribers.create({
      subscriberId,
      firstName: appConfig.company.name,
      email: appConfig.company.email,
    });

    // Set Slack webhook credentials for subscriber
    await novu.subscribers.credentials.update(
      { providerId: ChatOrPushProviderEnum.Slack, credentials: { webhookUrl: slackWebhookUrl } },
      subscriberId,
    );

    // Trigger Slack notification workflow
    const novuResponse = await novu.trigger({ workflowId, to: { subscriberId }, payload: { prefix, email } });

    logEvent('info', `Slack message sent successfully to subscriber: ${subscriberId}`);
    return novuResponse;
  } catch (error) {
    logError('Failed to send Slack message', error);
  }
};
