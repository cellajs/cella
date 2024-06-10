import { streams } from '../modules/general';

export const sendSSE = (userId: string, eventName: string, data: Record<string, unknown>): void => {
  const stream = streams.get(userId);
  if (stream === undefined) return;
  stream.writeSSE({
    event: eventName,
    data: JSON.stringify(data),
    retry: 5000,
  });
};

export const sendSSEToUsers = (users: string[] | null, eventName: string, data: Record<string, unknown>): void => {
  if (!users || users.length === 0) return;
  users.map((id) => sendSSE(id, eventName, data));
};
