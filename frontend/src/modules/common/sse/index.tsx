import { deleteMenuItem, updateMenuItem } from '~/modules/common/sse/helpers';
import { useSSE } from '~/modules/common/sse/use-sse';
import { useNavigationStore } from '~/store/navigation';
import type { UserMenuItem } from '~/types/common';

const SSE = () => {
  const updateEntity = (e: MessageEvent<string>) => {
    try {
      const updatedItem = JSON.parse(e.data);
      useNavigationStore.setState({ menu: updateMenuItem(updatedItem as UserMenuItem) });
    } catch (error) {
      console.error('Error parsing main update event', error);
    }
  };

  const removeEntity = (e: MessageEvent<string>) => {
    try {
      const deleteResponse = JSON.parse(e.data);
      useNavigationStore.setState({ menu: deleteMenuItem(deleteResponse.id) });
    } catch (error) {
      console.error('Error parsing main remove event', error);
    }
  };
  useSSE('update_entity', (e) => updateEntity(e));
  useSSE('remove_entity', (e) => removeEntity(e));

  return null;
};

export default SSE;
