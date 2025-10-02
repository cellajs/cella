import * as Sentry from '@sentry/react';
import { useSSE } from '~/modules/common/sse/use-sse';
import type { UserMenuItem } from '~/modules/me/types';
import { addMenuItem, deleteMenuItem, updateMenuItem } from '~/modules/navigation/menu-sheet/helpers/menu-operations';

type SSEEventsMap = {
  membership_created: { newItem: UserMenuItem; attachToIdOrSlug?: string };
  membership_updated: UserMenuItem;
  entity_updated: UserMenuItem;
  membership_removed: { id: string };
  entity_deleted: { id: string };
};

type EventCallback<T extends keyof SSEEventsMap> = (event: MessageEvent<string>, data: SSEEventsMap[T]) => void;

const useTypedSSE = <T extends keyof SSEEventsMap>(type: T, callback: EventCallback<T>) => {
  useSSE(type, (e) => {
    try {
      const data = JSON.parse(e.data) as SSEEventsMap[T];
      callback(e, data);
    } catch (error) {
      Sentry.captureException(error);
      console.error(`Failed to parse SSE event - ${type}`, error);
    }
  });
};

const SSE = () => {
  // Add menu item
  useTypedSSE('membership_created', (_, data) => addMenuItem(data.newItem, data.attachToIdOrSlug));

  // Update menu item
  useTypedSSE('entity_updated', (_, data) => updateMenuItem(data));
  useTypedSSE('membership_updated', (_, data) => updateMenuItem(data));

  // Delete menu item
  useTypedSSE('entity_deleted', (_, data) => deleteMenuItem(data.id));
  useTypedSSE('membership_removed', (_, data) => deleteMenuItem(data.id));

  return null; // This component does not render any UI
};

export default SSE;
