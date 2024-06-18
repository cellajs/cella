import { useNavigationStore } from '~/store/navigation';
import type { ContextEntity } from '~/types';
import { menuSections } from '../nav-sheet/sheet-menu';
import { removeIdFromSubMenu } from './helpers';
import { useSSE } from './use-sse';

const SSE = () => {
  const updateEntity = (e: MessageEvent<string>) => {
    try {
      const entityData = JSON.parse(e.data);
      const storage = menuSections.find((el) => el.type === entityData.entity);
      if (!storage) return;
      const storageType = storage.storageType;
      useNavigationStore.setState((state) => {
        const mainEntity = state.menu[storageType].find((el) => el.id === entityData.workspaceId);
        if (mainEntity) {
          // Check if the subEntity exists in the submenu
          const subEntityNotExist = mainEntity.submenu?.every((item) => item.id !== entityData.id);
          // If subEntity does not exist in the list, add it
          if (subEntityNotExist && mainEntity.submenu) {
            mainEntity.submenu = [entityData, ...mainEntity.submenu];
            return state;
          }
          // Merge project with existing item
          if (mainEntity.submenu) {
            mainEntity.submenu = mainEntity.submenu.map((item) => (item.id === entityData.id ? { ...item, ...entityData } : item));
          }
          return state;
        }
        const notExist = state.menu[storageType].every((item) => item.id !== entityData.id);
        // If entity does not exist in the list, add it
        if (notExist) {
          state.menu[storageType] = [entityData, ...state.menu[storageType]];
          return state;
        }
        // Merge entity with existing item
        state.menu[storageType] = state.menu[storageType].map((item) => (item.id === entityData.id ? { ...item, ...entityData } : item));
        return state;
      });
    } catch (error) {
      console.error('Error parsing main update event', error);
    }
  };

  const addEntity = (e: MessageEvent<string>) => {
    try {
      const entityData = JSON.parse(e.data);
      const storage = menuSections.find((el) => el.type === entityData.entity);
      if (!storage) return;
      const storageType = storage.storageType;
      useNavigationStore.setState((state) => {
        const mainEntity = state.menu[storageType].find((el) => el.id === entityData.workspaceId);
        if (mainEntity) {
          // Check if the subEntity exists in the submenu
          const notExist = mainEntity.submenu?.every((item) => item.id !== entityData.id);
          // If subEntity does not exist in the list, add it
          if (notExist && mainEntity.submenu) {
            mainEntity.submenu = [entityData, ...mainEntity.submenu];
            return state;
          }
          // Merge project with existing item
          if (mainEntity.submenu) {
            mainEntity.submenu = mainEntity.submenu.map((item) => (item.id === entityData.id ? { ...item, ...entityData } : item));
          }
          return state;
        }
        const exist = state.menu[storageType].some((item) => item.id === entityData.id);

        // If entity already exists in the list, do nothing
        if (exist) return state;

        state.menu[storageType] = [entityData, ...state.menu[storageType]];
        return state;
      });
    } catch (error) {
      console.error('Error parsing main create new event', error);
    }
  };

  const removeEntity = (e: MessageEvent<string>) => {
    try {
      const entityData = JSON.parse(e.data);
      const storage = menuSections.find((el) => el.type === entityData.entity);
      if (!storage) return;
      const storageType = storage.storageType;
      const entityType = entityData.entity as ContextEntity;
      useNavigationStore.setState((state) => {
        state.menuOrder[entityType].mainList = state.menuOrder[entityType].mainList.filter((id) => id !== entityData.id);
        state.menuOrder[entityType].subList = removeIdFromSubMenu(state.menuOrder[entityType].subList, entityData.id);

        const mainEntity = state.menu[storageType].find((el) => el.id === entityData.id);
        // Ensure the mainEntity exists
        if (mainEntity) {
          // Merge project with existing item
          if (mainEntity.submenu) {
            mainEntity.submenu = mainEntity.submenu.map((item) => (item.id !== entityData.id ? { ...item, ...entityData } : item));
            return state;
          }
        }
        state.menu[storageType] = state.menu[storageType].filter((item) => item.id !== entityData.id);
        return state;
      });
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
