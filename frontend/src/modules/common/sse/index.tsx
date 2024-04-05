import { useNavigationStore } from '~/store/navigation';
import { useSSE } from './useSSE';

const SSE = () => {
  useSSE('update_organization', (e) => {
    try {
      const organization = JSON.parse(e.data);
      useNavigationStore.setState((state) => {
        state.menu.organizations.active = state.menu.organizations.active.map((org) => (org.id === organization.id ? organization : org));
      });
    } catch (error) {
      console.error('Error parsing update_organization event', error);
    }
  });

  useSSE('remove_organization', (e) => {
    try {
      const organization = JSON.parse(e.data);
      useNavigationStore.setState((state) => {
        state.menu.organizations.active = state.menu.organizations.active.filter((org) => org.id !== organization.id);
      });
    } catch (error) {
      console.error('Error parsing remove_organization event', error);
    }
  });

  useSSE('new_membership', (e) => {
    try {
      const organization = JSON.parse(e.data);
      useNavigationStore.setState((state) => {
        state.menu.organizations.active = [organization, ...state.menu.organizations.active];
      });
    } catch (error) {
      console.error('Error parsing new_membership event', error);
    }
  });

  useSSE('remove_membership', (e) => {
    try {
      const organization = JSON.parse(e.data);
      useNavigationStore.setState((state) => {
        state.menu.organizations.active = state.menu.organizations.active.filter((org) => org.id !== organization.id);
      });
    } catch (error) {
      console.error('Error parsing remove_membership event', error);
    }
  });

  return null;
};

export default SSE;
