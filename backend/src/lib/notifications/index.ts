import { Novu } from '@novu/api';
import { UpdateSubscriberChannelRequestDtoProviderId as ProviderEnum } from '@novu/api/models/components';
import { config } from 'config';
import { novuConfig } from '#/lib/notifications/novu-config';
import { logEvent } from '#/utils/logger';

/**
 * Sends a Slack message via Novu to notify about new contact form submissions or waitlist requests.
 */
export const sendSlackMessage = async (prefix: string, email: string) => {
  try {
    const { secretKey, serverURL, slackWebhookUrl, subscriberId, workflowId } = novuConfig;

    if (!secretKey || !slackWebhookUrl) return logEvent({ msg: 'Missing required Novu config values (API key or Slack webhook).' });

    const novu = new Novu({ secretKey, serverURL });

    // Upsert subscriber to ensure it's created or reused
    await novu.subscribers.create({
      subscriberId,
      firstName: config.company.name,
      email: config.company.email,
    });

    // Set Slack webhook credentials for subscriber
    await novu.subscribers.credentials.update({ providerId: ProviderEnum.Slack, credentials: { webhookUrl: slackWebhookUrl } }, subscriberId);

    // Trigger Slack notification workflow
    await novu.trigger({ workflowId, to: { subscriberId }, payload: { prefix, email } });

    return logEvent({ msg: `Slack message sent successfully to subscriber: ${subscriberId}` });
  } catch (err) {
    console.error('Slack message error:', err);
    return logEvent({ msg: `Failed to send Slack message: ${(err as Error).message}`, severity: 'error' });
  }
};
