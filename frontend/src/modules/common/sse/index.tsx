import { queryClient } from '~/lib/router';
import { useSSE } from '~/modules/common/sse/use-sse';
import { membersKeys } from '~/modules/memberships/query';
import { addMenuItem, deleteMenuItem, updateMenuItem } from '~/modules/navigation/menu-sheet/helpers/menu-operations';
import { organizationsKeys } from '~/modules/organizations/query';
import type { UserMenuItem } from '~/modules/users/types';
import { getSimilarQueries } from '~/query/helpers/mutate-query';

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

  const newMember = (e: MessageEvent<string>) => {
    try {
      const data = JSON.parse(e.data);
      const { id, slug } = data;
      queryClient.invalidateQueries({ queryKey: organizationsKeys.single(id) });
      queryClient.invalidateQueries({ queryKey: organizationsKeys.single(slug) });

      const membersQueriesByOrgId = getSimilarQueries([...membersKeys.list(), { orgIdOrSlug: id }]);
      const membersQueriesByOrgSlug = getSimilarQueries([...membersKeys.list(), { orgIdOrSlug: slug }]);
      const membersQueries = [...membersQueriesByOrgId, ...membersQueriesByOrgSlug];

      for (const [queryKey] of membersQueries) queryClient.invalidateQueries({ queryKey });
    } catch (error) {
      console.error('Error parsing main new member event', error);
    }
  };

  const newInvite = (e: MessageEvent<string>) => {
    try {
      const data = JSON.parse(e.data);
      const { id, slug } = data;

      queryClient.invalidateQueries({ queryKey: organizationsKeys.single(id) });
      queryClient.invalidateQueries({ queryKey: organizationsKeys.single(slug) });
    } catch (error) {
      console.error('Error parsing main new member event', error);
    }
  };

  useSSE('add_entity', (e) => addEntity(e));
  useSSE('update_entity', (e) => updateEntity(e));
  useSSE('remove_entity', (e) => removeEntity(e));
  useSSE('member_accept_invite', (e) => newMember(e));
  useSSE('new_member_invite', (e) => newInvite(e));

  return null;
};

export default SSE;
