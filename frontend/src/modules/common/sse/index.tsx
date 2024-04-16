import { useNavigationStore } from '~/store/navigation';
import { useSSE } from './use-sse';

const SSE = () => {
  useSSE('update_organization', (e) => {
    try {
      const organization = JSON.parse(e.data);
      useNavigationStore.setState((state) => {
        state.menu.organizations.items = state.menu.organizations.items.map((org) => (org.id === organization.id ? organization : org));
        return state;
      });
    } catch (error) {
      console.error('Error parsing update_organization event', error);
    }
  });

  useSSE('remove_organization', (e) => {
    try {
      const organization = JSON.parse(e.data);
      useNavigationStore.setState((state) => {
        state.menu.organizations.items = state.menu.organizations.items.filter((org) => org.id !== organization.id);
        return state;
      });
    } catch (error) {
      console.error('Error parsing remove_organization event', error);
    }
  });

  useSSE('new_membership', (e) => {
    try {
      const organization = JSON.parse(e.data);
      useNavigationStore.setState((state) => {
        state.menu.organizations.items = [...state.menu.organizations.items, organization];
        return state;
      });
    } catch (error) {
      console.error('Error parsing new_membership event', error);
    }
  });

  useSSE('remove_membership', (e) => {
    try {
      const organization = JSON.parse(e.data);
      useNavigationStore.setState((state) => {
        state.menu.organizations.items = state.menu.organizations.items.filter((org) => org.id !== organization.id);
        return state;
      });
    } catch (error) {
      console.error('Error parsing remove_membership event', error);
    }
  });

  return null;
};

export default SSE;
