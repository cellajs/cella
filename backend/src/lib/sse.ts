import { streams } from '#/modules/general';

// SSE is used to send real-time updates to the client. Useful for simple updates such as an updated entity or a notification.
const sendSSE = (userId: string, eventName: string, data: Record<string, unknown>): void => {
  const stream = streams.get(userId);
  if (!stream) return;

  stream.writeSSE({
    event: eventName,
    data: JSON.stringify(data),
    retry: 5000,
  });
};

/**
 * Send Server-Sent Events (SSE) to multiple users.
 * This function calls `sendSSE` for each user in the `userIds` array, sending the same event
 * and data to each user.
 *
 * @param userIds - An array of user IDs to send the SSE to. If null or empty, no events will be sent.
 * @param eventName - The name of the event that the clients will listen for.
 * @param data - The data to send with the event, usually as an object that will be converted to JSON.
 */
export const sendSSEToUsers = (userIds: string[] | null, eventName: string, data: Record<string, unknown>): void => {
  if (!userIds || userIds.length === 0) return;
  userIds.map((id) => sendSSE(id, eventName, data));
};
