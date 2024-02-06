import { ErrorBoundary } from '@appsignal/react';
import { ScrollRestoration } from '@tanstack/react-router';

import { AppContent } from '~/modules/common/app-content';
import { appSignal } from '~/lib/appsignal';

import { AppNav } from './app-nav';
import { AppSheet } from './app-sheet';
import ErrorPage from './error';

const App = () => {
  return (
    <ErrorBoundary instance={appSignal} fallback={(error: Error) => <ErrorPage error={error} />}>
      <AppNav />
      <AppSheet />
      <AppContent />
      <ScrollRestoration />
    </ErrorBoundary>
  );
};

export default App;
