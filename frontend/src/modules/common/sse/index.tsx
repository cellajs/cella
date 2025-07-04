import { useSSE } from '~/modules/common/sse/use-sse';
import type { UserMenuItem } from '~/modules/me/types';
import { handlePendingInvites } from '~/modules/memberships/query-mutations';
import { addMenuItem, deleteMenuItem, updateMenuItem } from '~/modules/navigation/menu-sheet/helpers/menu-operations';
import { useNavigationStore } from '~/store/navigation';

const SSE = () => {
  const addEntity = (e: MessageEvent<string>) => {
    try {
      const data = JSON.parse(e.data);
      const { newItem, sectionName, parentSlug } = data;
      addMenuItem(newItem as UserMenuItem, sectionName, parentSlug);
    } catch (error) {
      console.error('Error parsing add menu item event', error);
    }
  };

  const updateEntity = (e: MessageEvent<string>) => {
    try {
      const updatedItem = JSON.parse(e.data);
      updateMenuItem(updatedItem as UserMenuItem);
    } catch (error) {
      console.error('Error parsing update event', error);
    }
  };

  const removeEntity = (e: MessageEvent<string>) => {
    try {
      const deleteResponse = JSON.parse(e.data);
      deleteMenuItem(deleteResponse.id);
    } catch (error) {
      console.error('Error parsing remove event', error);
    }
  };

  const updateInvites = (e: MessageEvent<string>) => {
    try {
      const entity = JSON.parse(e.data);

      const { menu } = useNavigationStore.getState();
      const organization = menu.organization.find(({ id }) => id === entity.organizationId);
      if (!organization) return;
      handlePendingInvites(entity, organization, -1);
    } catch (error) {
      console.error('Error parsing accept invite event', error);
    }
  };

  const handleMembersInvites = (e: MessageEvent<string>) => {
    try {
      const data = JSON.parse(e.data);
      const { targetEntity, organization, invitesCount } = data;

      handlePendingInvites(targetEntity, organization, invitesCount);
    } catch (error) {
      console.error('Error parsing members invite event', error);
    }
  };

  useSSE('add_entity', (e) => addEntity(e));
  useSSE('update_entity', (e) => updateEntity(e));
  useSSE('remove_entity', (e) => removeEntity(e));
  useSSE('invite_members', (e) => handleMembersInvites(e));
  useSSE('accept_invite', (e) => updateInvites(e));

  return null;
};

export default SSE;
