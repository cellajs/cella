import { ErrorBoundary } from 'react-error-boundary';
import { AppContent } from '~/modules/common/app-content';

import { Suspense, lazy } from 'react';
import ErrorNotice from './error-notice';
import { useSSE } from './sse/useSSE';
import { useNavigationStore } from '~/store/navigation';

// Lazy load App navigation
const AppNav = lazy(() => import('~/modules/common/app-nav'));

const App = () => {
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

  useSSE('update_membership', (e) => {
    try {
      const organization = JSON.parse(e.data);
      useNavigationStore.setState((state) => {
        state.menu.organizations.active = state.menu.organizations.active.map((org) => (org.id === organization.id ? organization : org));
      });
    } catch (error) {
      console.error('Error parsing update_membership event', error);
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

  return (
    <ErrorBoundary fallbackRender={({ error, resetErrorBoundary }) => <ErrorNotice error={error} resetErrorBoundary={resetErrorBoundary} />}>
      <Suspense>
        <AppNav />
      </Suspense>
      <AppContent />
    </ErrorBoundary>
  );
};

export default App;
