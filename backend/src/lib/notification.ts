import { ChatProviderIdEnum, Novu } from '@novu/node';
import { config } from 'config';
import { logEvent } from '#/middlewares/logger/log-event';
import { env } from '../../env';

export const sendSlackNotification = async (requestFor: string, email: string) => {
  try {
    if (!env.NOVU_API_KEY) return logEvent('Novu API key is not provided.');
    const novu = new Novu(env.NOVU_API_KEY);

    const subscriber = env.NOVU_SUB_ID || 'subscriber1';

    // Identify the subscriber. If there is no subscriber with such an ID, create one. If one exists, use it.
    await novu.subscribers.identify(subscriber, {
      firstName: config.company.name,
      email: config.company.email,
    });

    // Set's notification to chosen channel
    if (env.NOVU_SLACK_WEBHOOK) {
      await novu.subscribers.setCredentials(subscriber, ChatProviderIdEnum.Slack, {
        webhookUrl: env.NOVU_SLACK_WEBHOOK,
      });
    }

    // Send the notification
    novu.trigger('cellaslack', {
      to: {
        subscriberId: subscriber,
      },
      payload: {
        requestFor,
        email,
      },
    });

    return logEvent('Slack message send successful');
  } catch (err) {
    return logEvent('Slack message send failed');
  }
};
