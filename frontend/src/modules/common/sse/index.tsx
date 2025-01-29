import { queryClient } from '~/lib/router';
import { useSSE } from '~/modules/common/sse/use-sse';
import { addMenuItem, deleteMenuItem, updateMenuItem } from '~/modules/navigation/menu-sheet/helpers/menu-operations';
import { organizationsKeys } from '~/modules/organizations/query';
import type { UserMenuItem } from '~/types/common';

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

  // const newMember = (e: MessageEvent<string>) => {
  //   try {
  //     const data = JSON.parse(e.data);
  //     const { tokenId, newMember, entity } = data;

  //     const exactKeyId = membersKeys.table({ idOrSlug: entity.id, entityType: entity.entity, orgIdOrSlug: entity.organizationId });
  //     const exactKeySlug = membersKeys.table({ idOrSlug: entity.slug, entityType: entity.entity, orgIdOrSlug: entity.organizationId });

  //     const similarKeyId = membersKeys.similar({ idOrSlug: entity.id, entityType: entity.entity, orgIdOrSlug: entity.organizationId });
  //     const similarKeySlug = membersKeys.similar({ idOrSlug: entity.slug, entityType: entity.entity, orgIdOrSlug: entity.organizationId });

  //     const idQueries = getQueries<Member>(exactKeyId, similarKeyId);
  //     const slugQueries = getQueries<Member>(exactKeySlug, similarKeySlug);

  //     for (const query of [...idQueries, ...slugQueries]) {
  //       const [activeKey] = query;

  //       queryClient.setQueryData<InfiniteQueryData<Member> | QueryData<Member>>(activeKey, (oldData) => {
  //         if (!oldData) return oldData;
  //         const prevItems = getQueryItems(oldData);
  //         const updatedData = [...prevItems, newMember];
  //         return formatUpdatedData(oldData, updatedData, config.requestLimits.members);
  //       });
  //     }
  //   } catch (error) {
  //     console.error('Error parsing main new member event', error);
  //   }
  // };

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
  // useSSE('member_accept_invite', (e) => newMember(e));
  useSSE('new_member_invite', (e) => newInvite(e));

  return null;
};

export default SSE;
