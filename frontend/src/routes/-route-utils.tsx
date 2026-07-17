import { type ComponentType, type ReactNode, Suspense } from 'react';
import { ErrorNotice, type ErrorNoticeError } from '~/modules/common/error-notice';
import { Spinner } from '~/modules/common/spinner';
import type { BoundaryType } from '~/routes/types';

/** Wrap a component in Suspense with an optional fallback */
export const withSuspense = (Component: ComponentType, fallback?: ReactNode) => {
  const Wrapped = () => (
    <Suspense fallback={fallback}>
      <Component />
    </Suspense>
  );
  Wrapped.displayName = `withSuspense(${Component.displayName || Component.name || 'Component'})`;
  return Wrapped;
};

/** Wrap a component in Suspense with a centered spinner fallback */
export const withSuspenseSpinner = (Component: ComponentType) =>
  withSuspense(Component, <Spinner className="mt-[45vh] h-10 w-10" />);

/** Create an error boundary component for a given boundary */
export const createErrorComponent = (boundary: BoundaryType, homePath?: string) => {
  const ErrorComp = ({ error, reset }: { error: unknown; reset: () => void }) => (
    <ErrorNotice error={error as ErrorNoticeError} resetErrorBoundary={reset} boundary={boundary} homePath={homePath} />
  );
  ErrorComp.displayName = `ErrorComponent(${boundary})`;
  return ErrorComp;
};

/** Create a not-found component for a given boundary */
export const createNotFoundComponent = (boundary: BoundaryType, homePath?: string) => {
  const NotFoundComp = () => (
    <ErrorNotice boundary={boundary} error={new Error('Page not found')} homePath={homePath} />
  );
  NotFoundComp.displayName = `NotFoundComponent(${boundary})`;
  return NotFoundComp;
};

// === Static route components ===

export const ErrorNoticePageComponent = () => <ErrorNotice boundary="public" />;

export const SpinnerPage = () => <Spinner className="mt-[45vh] h-10 w-10" />;
