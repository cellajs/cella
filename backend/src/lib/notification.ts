import { ChatProviderIdEnum, Novu } from '@novu/node';
import { config } from 'config';
import { logEvent } from '#/middlewares/logger/log-event';
import { env } from '../../env';

/**
 * Send a Slack message to the chosen channel using Novu API.
 *
 * @link https://github.com/novuhq/novu
 */
export const sendSlackMessage = async (requestFor: string, email: string) => {
  try {
    if (!env.NOVU_API_KEY) return logEvent('Novu API key is not provided.');
    const novu = new Novu(env.NOVU_API_KEY);

    const subscriberId = env.NOVU_SUB_ID || 'subscriber1';

    // Identify the subscriber. If there is no subscriber with such an ID, create one. If one exists, use it.
    await novu.subscribers.identify(subscriberId, {
      firstName: config.company.name,
      email: config.company.email,
    });

    // Set message to chosen channel
    if (env.NOVU_SLACK_WEBHOOK) {
      await novu.subscribers.setCredentials(subscriberId, ChatProviderIdEnum.Slack, {
        webhookUrl: env.NOVU_SLACK_WEBHOOK,
      });
    }

    // Send message
    novu.trigger(`${config.slug}-slack`, {
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
