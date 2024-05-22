import { streams } from '../modules/general';

export const sendSSE = (userId: string | null, eventName: string, data: Record<string, unknown>): void => {
  if (!userId) {
    return;
  }

  const stream = streams.get(userId);

  if (stream) {
    stream.writeSSE({
      event: eventName,
      data: JSON.stringify(data),
      retry: 5000,
    });
  }
};
