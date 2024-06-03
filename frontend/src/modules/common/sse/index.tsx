import { useNavigationStore } from '~/store/navigation';
import { useSSE } from './use-sse';

type StorageEntityType = 'organizations' | 'workspaces';

const SSE = () => {
  const updateEntity = (e: MessageEvent<string>) => {
    try {
      const entity = JSON.parse(e.data);
      const storageType = entity.storageType as StorageEntityType;
      useNavigationStore.setState((state) => {
        const notExist = state.menu[storageType].items.every((item) => item.id !== entity.id);
        // If entity does not exist in the list, add it
        if (notExist) {
          state.menu[storageType].items = [entity, ...state.menu[storageType].items];
          return state;
        }
        // Merge entity with existing item
        state.menu[storageType].items = state.menu[storageType].items.map((item) => (item.id === entity.id ? { ...item, ...entity } : item));
        return state;
      });
    } catch (error) {
      console.error('Error parsing main update event', error);
    }
  };

  const addEntity = (e: MessageEvent<string>) => {
    try {
      const entity = JSON.parse(e.data);
      const storageType = entity.storageType as StorageEntityType;
      useNavigationStore.setState((state) => {
        const exist = state.menu[storageType].items.some((item) => item.id === entity.id);

        // If entity already exists in the list, do nothing
        if (exist) return state;
        if (entity.haveSubMenu) state.submenuItemsOrder[entity.id] = [];

        state.menu[storageType].items = [entity, ...state.menu[storageType].items];
        return state;
      });
    } catch (error) {
      console.error('Error parsing main create new event', error);
    }
  };

  const removeEntity = (e: MessageEvent<string>) => {
    try {
      const entity = JSON.parse(e.data);
      const storageType = entity.storageType as StorageEntityType;
      useNavigationStore.setState((state) => {
        state.menu[storageType].items = state.menu[storageType].items.filter((item) => item.id !== entity.id);
        return state;
      });
    } catch (error) {
      console.error('Error parsing main remove event', error);
    }
  };
  const createUpdateSubEntity = (e: MessageEvent<string>) => {
    try {
      const subEntity = JSON.parse(e.data);
      const storageType = subEntity.storageType as StorageEntityType;
      useNavigationStore.setState((state) => {
        const mainEntity = state.menu[storageType].items.find((el) => el.id === subEntity.workspaceId);
        // Ensure the mainEntity exists
        if (!mainEntity) return state;
        // Check if the subEntity exists in the submenu
        const notExist = mainEntity.submenu?.items.every((item) => item.id !== subEntity.id);
        // If subEntity does not exist in the list, add it
        if (notExist && mainEntity.submenu) {
          mainEntity.submenu.items = [subEntity, ...mainEntity.submenu.items];
          return state;
        }
        // Merge project with existing item
        if (mainEntity.submenu) {
          mainEntity.submenu.items = mainEntity.submenu.items.map((item) => (item.id === subEntity.id ? { ...item, ...subEntity } : item));
        }
        return state;
      });
    } catch (error) {
      console.error('Error parsing subEntity create/update event', error);
    }
  };

  const removeSubEntity = (e: MessageEvent<string>) => {
    try {
      const subEntity = JSON.parse(e.data);
      const storageType = subEntity.storageType as StorageEntityType;
      useNavigationStore.setState((state) => {
        const mainEntity = state.menu[storageType].items.find((el) => el.id === subEntity.workspaceId);
        // Ensure the mainEntity exists
        if (!mainEntity) return state;
        // Merge project with existing item
        if (mainEntity.submenu) {
          mainEntity.submenu.items = mainEntity.submenu.items.map((item) => (item.id !== subEntity.id ? { ...item, ...subEntity } : item));
        }
        return state;
      });
    } catch (error) {
      console.error('Error parsing main remove event', error);
    }
  };

  useSSE('create_main_entity', (e) => addEntity(e));
  useSSE('update_main_entity', (e) => updateEntity(e));
  useSSE('remove_main_entity', (e) => removeEntity(e));

  useSSE('update_sub_entity', (e) => createUpdateSubEntity(e));
  useSSE('create_sub_entity', (e) => createUpdateSubEntity(e));
  useSSE('remove_sub_entity', (e) => removeSubEntity(e));

  return null;
};

export default SSE;
