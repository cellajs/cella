import { useNavigationStore } from '~/store/navigation';
import { useSSE } from './use-sse';

type EntityType = 'organizations' | 'workspaces';
const SSE = () => {
  const updateProject = (e: MessageEvent<string>) => {
    try {
      const entity = JSON.parse(e.data);
      useNavigationStore.setState((state) => {
        const workspace = state.menu.workspaces.items.find((el) => el.id === entity.workspaceId);
        // Ensure the workspace exists
        if (!workspace) return state;
        // Check if the entity exists in the submenu
        const notExist = workspace.submenu?.items.every((item) => item.id !== entity.id);
        // If entity does not exist in the list, add it
        if (notExist && workspace.submenu) {
          workspace.submenu.items = [entity, ...workspace.submenu.items];
          return state;
        }
        // Merge entity with existing item
        if (workspace.submenu) {
          workspace.submenu.items = workspace.submenu.items.map((item) => (item.id === entity.id ? { ...item, ...entity } : item));
        }

        return state;
      });
    } catch (error) {
      console.error('Error parsing project event', error);
    }
  };

  const updateEntity = (e: MessageEvent<string>, entityType: EntityType) => {
    try {
      const entity = JSON.parse(e.data);
      useNavigationStore.setState((state) => {
        const notExist = state.menu[entityType].items.every((item) => item.id !== entity.id);
        // If entity does not exist in the list, add it
        if (notExist) {
          state.menu[entityType].items = [entity, ...state.menu[entityType].items];
          return state;
        }
        // Merge entity with existing item
        state.menu[entityType].items = state.menu[entityType].items.map((item) => (item.id === entity.id ? { ...item, ...entity } : item));
        return state;
      });
    } catch (error) {
      console.error(`Error parsing ${entityType} event`, error);
    }
  };

  const addEntity = (e: MessageEvent<string>, entityType: EntityType) => {
    try {
      const entity = JSON.parse(e.data);
      useNavigationStore.setState((state) => {
        const exist = state.menu[entityType].items.some((item) => item.id === entity.id);

        // If entity already exists in the list, do nothing
        if (exist) {
          return state;
        }

        state.menu[entityType].items = [entity, ...state.menu[entityType].items];
        return state;
      });
    } catch (error) {
      console.error(`Error parsing new_${entityType} event`, error);
    }
  };

  const removeEntity = (e: MessageEvent<string>, entityType: EntityType) => {
    try {
      const entity = JSON.parse(e.data);
      useNavigationStore.setState((state) => {
        state.menu[entityType].items = state.menu[entityType].items.filter((item) => item.id !== entity.id);
        return state;
      });
    } catch (error) {
      console.error(`Error parsing remove_${entityType} event`, error);
    }
  };

  useSSE('update_organization', (e) => updateEntity(e, 'organizations'));
  useSSE('remove_organization', (e) => removeEntity(e, 'organizations'));
  useSSE('new_organization_membership', (e) => addEntity(e, 'organizations'));
  useSSE('remove_organization_membership', (e) => removeEntity(e, 'organizations'));

  useSSE('update_workspace', (e) => updateEntity(e, 'workspaces'));
  useSSE('remove_workspace', (e) => removeEntity(e, 'workspaces'));
  useSSE('new_workspace_membership', (e) => addEntity(e, 'workspaces'));
  useSSE('remove_workspace_membership', (e) => removeEntity(e, 'workspaces'));

  useSSE('update_project', (e) => updateProject(e));

  return null;
};

export default SSE;
