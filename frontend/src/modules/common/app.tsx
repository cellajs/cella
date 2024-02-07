import { ErrorBoundary } from '@appsignal/react';

import { appSignal } from '~/lib/appsignal';
import { AppContent } from '~/modules/common/app-content';

import AppNav from './app-nav';
import { AppSheet } from './app-sheet';
import ErrorPage from './error';

const App = () => {
  return (
    <ErrorBoundary instance={appSignal} fallback={(error: Error) => <ErrorPage error={error} />}>
      <AppNav />
      <AppSheet />
      <AppContent />
    </ErrorBoundary>
  );
};

export default App;
