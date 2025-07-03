import { useSSE } from '~/modules/common/sse/use-sse';
import type { EntityPage } from '~/modules/entities/types';
import type { UserMenuItem } from '~/modules/me/types';
import { membersKeys } from '~/modules/memberships/query';
import { updateInvitesCount } from '~/modules/memberships/query-mutations';
import { addMenuItem, deleteMenuItem, updateMenuItem } from '~/modules/navigation/menu-sheet/helpers/menu-operations';
import { queryClient } from '~/query/query-client';
import { useNavigationStore } from '~/store/navigation';

const SSE = () => {
  const addEntity = (e: MessageEvent<string>) => {
    try {
      const data = JSON.parse(e.data);
      const { newItem, sectionName, parentSlug } = data;
      addMenuItem(newItem as UserMenuItem, sectionName, parentSlug);
    } catch (error) {
      console.error('Error parsing main add menu item event', error);
    }
  };

  const updateEntity = (e: MessageEvent<string>) => {
    try {
      const updatedItem = JSON.parse(e.data);
      updateMenuItem(updatedItem as UserMenuItem);
    } catch (error) {
      console.error('Error parsing main update event', error);
    }
  };

  const removeEntity = (e: MessageEvent<string>) => {
    try {
      const deleteResponse = JSON.parse(e.data);
      deleteMenuItem(deleteResponse.id);
    } catch (error) {
      console.error('Error parsing main remove event', error);
    }
  };

  const updateInvites = (e: MessageEvent<string>) => {
    try {
      const entity = JSON.parse(e.data);
      const { id, slug, entityType, organizationId } = entity;
      const count = -1;
      // If the entity is not an organization but belongs to one, update its cache too
      if (entityType !== 'organization' && organizationId) {
        const { menu } = useNavigationStore.getState();
        const organization = menu.organization.find(({ id }) => id === organizationId);
        if (organization) {
          queryClient.setQueryData<EntityPage>(['organization', organization.id], (data) => updateInvitesCount(data, count));
          queryClient.setQueryData<EntityPage>(['organization', organization.slug], (data) => updateInvitesCount(data, count));

          queryClient.invalidateQueries({
            queryKey: membersKeys.table.pending({ idOrSlug: organization.slug, entityType: 'organization', orgIdOrSlug: organization.id }),
          });
        }
      }

      // Try cache update for both id and slug
      queryClient.setQueryData<EntityPage>([entityType, id], (data) => updateInvitesCount(data, count));
      queryClient.setQueryData<EntityPage>([entityType, slug], (data) => updateInvitesCount(data, count));

      queryClient.invalidateQueries({
        queryKey: membersKeys.table.pending({ idOrSlug: slug, entityType, orgIdOrSlug: organizationId || id }),
      });
    } catch (error) {
      console.error('Error parsing main accept invite item event', error);
    }
  };

  useSSE('add_entity', (e) => addEntity(e));
  useSSE('update_entity', (e) => updateEntity(e));
  useSSE('remove_entity', (e) => removeEntity(e));
  useSSE('accept_invite', (e) => updateInvites(e));

  return null;
};

export default SSE;
