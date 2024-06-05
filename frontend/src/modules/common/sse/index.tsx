import { useNavigationStore } from '~/store/navigation';
import { useSSE } from './use-sse';
import { menuSections } from '../nav-sheet/sheet-menu';

const SSE = () => {
  const updateEntity = (e: MessageEvent<string>) => {
    try {
      const entityData = JSON.parse(e.data);

      const storageType = menuSections.find((el) => el.type === entityData.entity)?.storageType;
      if (!storageType) return;
      useNavigationStore.setState((state) => {
        const mainEntity = state.menu[storageType].items.find((el) => el.id === entityData.workspaceId);
        if (mainEntity) {
          // Check if the subEntity exists in the submenu
          const subEntityNotExist = mainEntity.submenu?.items.every((item) => item.id !== entityData.id);
          // If subEntity does not exist in the list, add it
          if (subEntityNotExist && mainEntity.submenu) {
            mainEntity.submenu.items = [entityData, ...mainEntity.submenu.items];
            return state;
          }
          // Merge project with existing item
          if (mainEntity.submenu) {
            mainEntity.submenu.items = mainEntity.submenu.items.map((item) => (item.id === entityData.id ? { ...item, ...entityData } : item));
          }
          return state;
        }
        const notExist = state.menu[storageType].items.every((item) => item.id !== entityData.id);
        // If entity does not exist in the list, add it
        if (notExist) {
          state.menu[storageType].items = [entityData, ...state.menu[storageType].items];
          return state;
        }
        // Merge entity with existing item
        state.menu[storageType].items = state.menu[storageType].items.map((item) => (item.id === entityData.id ? { ...item, ...entityData } : item));
        return state;
      });
    } catch (error) {
      console.error('Error parsing main update event', error);
    }
  };

  const addEntity = (e: MessageEvent<string>) => {
    try {
      const entityData = JSON.parse(e.data);
      const section = menuSections.find((el) => el.type === entityData.entity);
      if (!section) return;
      useNavigationStore.setState((state) => {
        const mainEntity = state.menu[section.storageType].items.find((el) => el.id === entityData.workspaceId);
        if (mainEntity) {
          // Check if the subEntity exists in the submenu
          const notExist = mainEntity.submenu?.items.every((item) => item.id !== entityData.id);
          // If subEntity does not exist in the list, add it
          if (notExist && mainEntity.submenu) {
            mainEntity.submenu.items = [entityData, ...mainEntity.submenu.items];
            return state;
          }
          // Merge project with existing item
          if (mainEntity.submenu) {
            mainEntity.submenu.items = mainEntity.submenu.items.map((item) => (item.id === entityData.id ? { ...item, ...entityData } : item));
          }
          return state;
        }
        const exist = state.menu[section.storageType].items.some((item) => item.id === entityData.id);

        // If entity already exists in the list, do nothing
        if (exist) return state;
        if (section.hasSubmenu) state.submenuItemsOrder[entityData.id] = [];

        state.menu[section.storageType].items = [entityData, ...state.menu[section.storageType].items];
        return state;
      });
    } catch (error) {
      console.error('Error parsing main create new event', error);
    }
  };

  const removeEntity = (e: MessageEvent<string>) => {
    try {
      const entityData = JSON.parse(e.data);
      const storageType = menuSections.find((el) => el.type === entityData.entity)?.storageType;
      if (!storageType) return;
      useNavigationStore.setState((state) => {
        const mainEntity = state.menu[storageType].items.find((el) => el.id === entityData.workspaceId);
        // Ensure the mainEntity exists
        if (mainEntity) {
          // Merge project with existing item
          if (mainEntity.submenu) {
            mainEntity.submenu.items = mainEntity.submenu.items.map((item) => (item.id !== entityData.id ? { ...item, ...entityData } : item));
            return state;
          }
        }
        state.menu[storageType].items = state.menu[storageType].items.filter((item) => item.id !== entityData.id);
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
