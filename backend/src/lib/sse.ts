import { streams } from '#/modules/general';

const sendSSE = (userId: string, eventName: string, data: Record<string, unknown>): void => {
  const stream = streams.get(userId);
  if (stream === undefined) return;

  stream.writeSSE({
    event: eventName,
    data: JSON.stringify(data),
    retry: 5000,
  });
};

export const sendSSEToUsers = (userIds: string[] | null, eventName: string, data: Record<string, unknown>): void => {
  if (!userIds || userIds.length === 0) return;
  userIds.map((id) => sendSSE(id, eventName, data));
};
