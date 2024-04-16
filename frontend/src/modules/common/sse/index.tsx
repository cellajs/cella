import { useNavigationStore } from '~/store/navigation';
import { useSSE } from './use-sse';

const SSE = () => {
  useSSE('update_organization', (e) => {
    try {
      const organization = JSON.parse(e.data);
      useNavigationStore.setState((state) => ({
        menu: {
          ...state.menu,
          organizations: {
            ...state.menu.organizations,
            info: state.menu.organizations.info.map((org) => (org.id === organization.id ? organization : org)),
          },
        },
      }));
    } catch (error) {
      console.error('Error parsing update_organization event', error);
    }
  });

  useSSE('remove_organization', (e) => {
    try {
      const organization = JSON.parse(e.data);
      useNavigationStore.setState((state) => ({
        menu: {
          ...state.menu,
          organizations: {
            ...state.menu.organizations,
            info: state.menu.organizations.info.filter((org) => org.id !== organization.id),
          },
        },
      }));
    } catch (error) {
      console.error('Error parsing remove_organization event', error);
    }
  });

  useSSE('new_membership', (e) => {
    try {
      const organization = JSON.parse(e.data);
      useNavigationStore.setState((state) => ({
        menu: {
          ...state.menu,
          organizations: {
            ...state.menu.organizations,
            info: [organization, ...state.menu.organizations.info],
          },
        },
      }));
    } catch (error) {
      console.error('Error parsing new_membership event', error);
    }
  });

  useSSE('remove_membership', (e) => {
    try {
      const organization = JSON.parse(e.data);
      useNavigationStore.setState((state) => ({
        menu: {
          ...state.menu,
          organizations: {
            ...state.menu.organizations,
            info: state.menu.organizations.info.filter((org) => org.id !== organization.id),
          },
        },
      }));
    } catch (error) {
      console.error('Error parsing remove_membership event', error);
    }
  });

  return null;
};

export default SSE;
