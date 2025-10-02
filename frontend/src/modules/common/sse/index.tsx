import * as Sentry from '@sentry/react';
import { useSSE } from '~/modules/common/sse/use-sse';
import type { UserMenuItem } from '~/modules/me/types';
import { addMenuItem, deleteMenuItem, updateMenuItem } from '~/modules/navigation/menu-sheet/helpers/menu-operations';

const SSE = () => {
  // Handle incoming event to add a new menu item
  const handleAddMenuItem = (e: MessageEvent<string>) => {
    try {
      const data = JSON.parse(e.data);
      const { newItem, sectionName, parentSlug } = data;

      addMenuItem(newItem as UserMenuItem, sectionName, parentSlug);
    } catch (error) {
      Sentry.captureException(error);
      console.error('Error parsing add menu item event', error);
    }
  };

  // Handle updates to an existing menu item
  const handleUpdateMenuItem = (e: MessageEvent<string>) => {
    try {
      const updatedItem = JSON.parse(e.data);
      updateMenuItem(updatedItem as UserMenuItem);
    } catch (error) {
      Sentry.captureException(error);
      console.error('Error parsing update menu item event', error);
    }
  };

  // Handle removal of a menu item
  const handleDeleteMenuItem = (e: MessageEvent<string>) => {
    try {
      const deleteResponse = JSON.parse(e.data);
      deleteMenuItem(deleteResponse.id);
    } catch (error) {
      Sentry.captureException(error);
      console.error('Error parsing delete menu item event', error);
    }
  };

  // Register SSE listeners
  useSSE('membership_created', (e) => handleAddMenuItem(e));
  useSSE('membership_updated', (e) => handleUpdateMenuItem(e));
  useSSE('membership_removed', (e) => handleDeleteMenuItem(e));

  useSSE('entity_updated', (e) => handleUpdateMenuItem(e));
  useSSE('entity_deleted', (e) => handleDeleteMenuItem(e));

  return null; // This component does not render any UI
};

export default SSE;
