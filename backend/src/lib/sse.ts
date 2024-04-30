import { streams } from '../modules/general';

export const sendSSE = (userId: string, eventName: string, data: Record<string, unknown>): void => {
  const stream = streams.get(userId);

  if (stream) {
    stream.writeSSE({
      event: eventName,
      data: JSON.stringify(data),
      retry: 5000,
    });
  }
};
