import { useNavigationStore } from '~/store/navigation';
import { useSSE } from './use-sse';

type EntityType = 'organizations' | 'workspaces';
const SSE = () => {
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

        state.menu[entityType].items = state.menu[entityType].items.map((item) => (item.id === entity.id ? entity : item));
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

  return null;
};

export default SSE;
