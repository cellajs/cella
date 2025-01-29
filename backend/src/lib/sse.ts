import { streams } from '#/modules/general';

// SSE is used to send real-time updates to the client. Useful for simple updates such as an updated entity or a notification.
const sendSSE = (userId: string, eventName: string, data?: Record<string, unknown>): void => {
  const stream = streams.get(userId);
  if (!stream) return;

  stream.writeSSE({
    event: eventName,
    data: JSON.stringify(data ?? 'No data passed'),
    retry: 5000,
  });
};

export const sendSSEToUsers = (userIds: string[] | null, eventName: string, data?: Record<string, unknown>): void => {
  if (!userIds || userIds.length === 0) return;
  userIds.map((id) => sendSSE(id, eventName, data));
};
