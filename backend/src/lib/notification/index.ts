import { Novu } from '@novu/api';
import { UpdateSubscriberChannelRequestDtoProviderId } from '@novu/api/models/components';
import { config } from 'config';
import { logEvent } from '#/middlewares/logger/log-event';
import { env } from '../../env';
import { novuConfig } from './novu-config';

/**
 * Send a Slack message to notify about new contact submissions or waitlist requests using Novu API.
 *
 * @link https://docs.novu.co/platform/sdks/server/typescript
 */
export const sendSlackMessage = async (prefix: string, email: string) => {
  try {
    if (!novuConfig.secretKey) return logEvent('Novu API key is not provided.');
    if (!novuConfig.slackWebhookUrl) return logEvent('Slack webhook is not provided.');

    const novu = new Novu({
      secretKey: novuConfig.secretKey,
      serverURL: novuConfig.serverURL,
    });

    // Identify the subscriber. If there is no subscriber with such an ID, create one. If one exists, use it.
    await novu.subscribers.create({
      subscriberId: novuConfig.subscriberId,
      firstName: config.company.name,
      email: config.company.email,
      data: {
        webhookUrl: env.NOVU_SLACK_WEBHOOK,
      },
    });

    // Update the subscriber's credentials with the Slack webhook URL
    await novu.subscribers.credentials.update(
      {
        credentials: { webhookUrl: env.NOVU_SLACK_WEBHOOK },
        providerId: UpdateSubscriberChannelRequestDtoProviderId.Slack,
      },
      novuConfig.subscriberId,
    );

    // Send message
    await novu.trigger({
      workflowId: novuConfig.workflowId,
      to: { subscriberId: novuConfig.subscriberId },
      // Add payload data due to body of message ({{payload.prefix}} from {{payload.email}})
      payload: { prefix, email },
    });

    return logEvent('Slack message sent successfully');
  } catch (err) {
    console.error(err);
    return logEvent('Slack message sent failed');
  }
};
