import { deleteMenuItem, updateMenuItem } from '~/modules/common/nav-sheet/helpers/menu-operations';
import { useSSE } from '~/modules/common/sse/use-sse';
import type { UserMenuItem } from '~/types/common';

const SSE = () => {
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
  useSSE('update_entity', (e) => updateEntity(e));
  useSSE('remove_entity', (e) => removeEntity(e));

  return null;
};

export default SSE;
