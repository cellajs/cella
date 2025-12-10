import * as ErrorTracker from '@sentry/react';
import { useSSE } from '~/modules/common/sse/use-sse';
import type { UserMenuItem } from '~/modules/me/types';
import { addMenuItem, deleteMenuItem, updateMenuItem } from '~/modules/navigation/menu-sheet/helpers/menu-operations';

// TODO in future add is to shared?
type SSEEventsMap = {
  membership_created: { newItem: UserMenuItem; attachToIdOrSlug?: string };
  membership_updated: UserMenuItem;
  entity_updated: UserMenuItem;
  membership_removed: { id: string };
  entity_deleted: { id: string };
};

const useTypedSSE = <T extends keyof SSEEventsMap>(type: T, callback: (data: SSEEventsMap[T]) => void) => {
  useSSE(type, (e: MessageEvent<string>) => {
    try {
      const data = JSON.parse(e.data) as SSEEventsMap[T];
      callback(data);
    } catch (error) {
      ErrorTracker.captureException(error);
      console.error('Error parsing update event', error);
    }
  });
};

const SSE = () => {
  // Add menu item
  useTypedSSE('membership_created', ({ newItem, attachToIdOrSlug }) => addMenuItem(newItem, attachToIdOrSlug));

  // Update menu item
  useTypedSSE('entity_updated', (data) => updateMenuItem(data));
  useTypedSSE('membership_updated', (data) => updateMenuItem(data));

  // Delete menu item
  useTypedSSE('entity_deleted', ({ id }) => deleteMenuItem(id));
  useTypedSSE('membership_removed', ({ id }) => deleteMenuItem(id));

  return null; // This component does not render any UI
};

export default SSE;
