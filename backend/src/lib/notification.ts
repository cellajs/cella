import { Novu } from '@novu/api';
import { config } from 'config';
import { logEvent } from '#/middlewares/logger/log-event';
import { env } from '../env';

/**
 * Send a Slack message to notify about new contact submissions or waitlist requests using Novu API.
 * TODO not working with new novu api? Also need to reset the config on novu.co dashboard
 *
 * @link https://docs.novu.co/platform/sdks/server/typescript
 */
export const sendSlackMessage = async (requestFor: string, email: string) => {
  try {
    if (!env.NOVU_API_KEY) return logEvent('Novu API key is not provided.');
    const novu = new Novu({
      secretKey: env.NOVU_API_KEY,
      serverURL: 'https://eu.api.novu.co',
    });

    // Hardcoded subscriber ID since its just a Slack webhook subscriber.
    const subscriberId = 'slack-contact-form-subscriber';

    // Identify the subscriber. If there is no subscriber with such an ID, create one. If one exists, use it.
    await novu.subscribers.create({
      subscriberId,
      firstName: config.company.name,
      email: config.company.email,
      data: {
        providerId: 'slack',
        webhookUrl: env.NOVU_SLACK_WEBHOOK,
      },
    });

    // Send message
    await novu.trigger({
      workflowId: `${config.slug}-contact-form-slack`,
      to: { subscriberId },
      payload: {
        requestFor,
        email,
      },
    });

    return logEvent('Slack message delivered');
  } catch (err) {
    console.error(err);
    return logEvent('Slack message failed');
  }
};
