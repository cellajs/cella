import { useUserStream } from '~/query/realtime/use-user-stream';
import { handleUserStreamMessage } from '~/query/realtime/user-stream-handler';

/**
 * React component that connects to the user stream and handles messages.
 * Replaces the legacy SSE and SSEProvider components.
 *
 * This component uses the new live stream infrastructure that receives events
 * from the CDC → ActivityBus pipeline for membership and organization changes.
 */
export default function UserStream() {
  useUserStream({
    initialOffset: 'now', // Start from now, no catch-up needed for user events
    onMessage: handleUserStreamMessage,
    onStateChange: (state) => {
      if (state === 'live') {
        console.debug('[UserStream] Connected and live');
      } else if (state === 'error') {
        console.debug('[UserStream] Connection error, will retry...');
      }
    },
  });

  return null;
}
