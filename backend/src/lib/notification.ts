import { ChatProviderIdEnum, Novu } from '@novu/node';
import { config } from 'config';
import { env } from 'env';
import { logEvent } from '../middlewares/logger/log-event';

export const sendSlackNotification = async (requestFor: string, email: string) => {
  try {
    if (!env.NOVU_API_KEY) return logEvent('Novu API key is not provided.');
    const novu = new Novu(env.NOVU_API_KEY);

    // Identify the subscriber. If there is no subscriber with such an ID, create one. If one exists, use it.
    await novu.subscribers.identify(config.company.novuSubId, {
      firstName: config.company.name,
      email: config.company.email,
    });

    // Set's notification to chosen channel
    await novu.subscribers.setCredentials(config.company.novuSubId, ChatProviderIdEnum.Slack, {
      webhookUrl: config.slackHook,
    });

    // Send the notification
    novu.trigger('cellaslack', {
      to: {
        subscriberId: config.company.novuSubId,
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
