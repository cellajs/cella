import { useSSE } from './use-sse';
import { useNavigationStore } from '~/store/navigation';
import { addMenuItem, updateMenuItem, deleteMenuItem } from './helpers';
import { menuSections } from '../nav-sheet/sheet-menu';

const SSE = () => {
  const addEntity = async (e: MessageEvent<string>) => {
    try {
      const newMenuItem = JSON.parse(e.data);
      const storage = menuSections.find((i) => i.type === newMenuItem.entity);
      if (!storage) return;
      const storageType = storage.storageType;
      useNavigationStore.setState({ menu: addMenuItem(newMenuItem, storageType) });
    } catch (error) {
      console.error('Error parsing main create new event', error);
    }
  };

  const updateEntity = (e: MessageEvent<string>) => {
    try {
      const updatedItem = JSON.parse(e.data);
      useNavigationStore.setState({ menu: updateMenuItem(updatedItem) });
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

  useSSE('create_entity', (e) => addEntity(e));
  useSSE('update_entity', (e) => updateEntity(e));
  useSSE('remove_entity', (e) => removeEntity(e));

  return null;
};

export default SSE;
