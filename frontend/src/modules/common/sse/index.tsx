import * as Sentry from '@sentry/react';
import { useSSE } from '~/modules/common/sse/use-sse';
import type { UserMenuItem } from '~/modules/me/types';
import { handlePendingInvites } from '~/modules/memberships/query-mutations';
import { addMenuItem, deleteMenuItem, updateMenuItem } from '~/modules/navigation/menu-sheet/helpers/menu-operations';
import { useNavigationStore } from '~/store/navigation';

const SSE = () => {
  // Handle incoming event to add a new entity to the menu
  const addEntity = (e: MessageEvent<string>) => {
    try {
      const data = JSON.parse(e.data);
      const { newItem, sectionName, parentSlug } = data;

      // Add new menu item under correct section and parent(if exist)
      addMenuItem(newItem as UserMenuItem, sectionName, parentSlug);
    } catch (error) {
      Sentry.captureException(error);
      console.error('Error parsing add menu item event', error);
    }
  };

  // Handle updates to an existing menu item
  const updateEntity = (e: MessageEvent<string>) => {
    try {
      const updatedItem = JSON.parse(e.data);

      updateMenuItem(updatedItem as UserMenuItem);
    } catch (error) {
      Sentry.captureException(error);
      console.error('Error parsing update event', error);
    }
  };

  // Handle removal of an entity from the menu
  const removeEntity = (e: MessageEvent<string>) => {
    try {
      const deleteResponse = JSON.parse(e.data);

      // Remove item by ID
      deleteMenuItem(deleteResponse.id);
    } catch (error) {
      Sentry.captureException(error);
      console.error('Error parsing remove event', error);
    }
  };

  // Handle when a user accepts an invite to an organization
  const updateInvites = (e: MessageEvent<string>) => {
    try {
      const entity = JSON.parse(e.data);

      // Get current menu state
      const { menu } = useNavigationStore.getState();

      // Find organization in menu
      const organization = menu.organization.find(({ id }) => id === entity.organizationId);
      if (!organization) return;

      // Apply change in pending invites count
      handlePendingInvites(entity, -1, organization.slug);
    } catch (error) {
      Sentry.captureException(error);
      console.error('Error parsing accept invite event', error);
    }
  };

  // Register SSE listeners
  useSSE('add_entity', (e) => addEntity(e));
  useSSE('update_entity', (e) => updateEntity(e));
  useSSE('remove_entity', (e) => removeEntity(e));
  useSSE('accept_invite', (e) => updateInvites(e));

  return null; // This component does not render any UI
};

export default SSE;
