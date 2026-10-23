import { type ComponentType, type ReactNode, Suspense } from 'react';
import { pageNotFoundError } from '~/modules/common/error-helpers';
import { ErrorNotice } from '~/modules/common/error-notice';
import { Spinner } from '~/modules/common/spinner';
import type { BoundaryType } from '~/routes/types';

export const withSuspense = (Component: ComponentType, fallback?: ReactNode) => {
  const Wrapped = () => (
    <Suspense fallback={fallback}>
      <Component />
    </Suspense>
  );
  Wrapped.displayName = `withSuspense(${Component.displayName || Component.name || 'Component'})`;
  return Wrapped;
};

export const withSuspenseSpinner = (Component: ComponentType) => withSuspense(Component, <SpinnerPage />);

export const createErrorComponent = (boundary: BoundaryType, homePath?: string) => {
  const ErrorComponent = ({ error, reset }: { error: unknown; reset: () => void }) => (
    <ErrorNotice error={error} resetErrorBoundary={reset} boundary={boundary} homePath={homePath} />
  );
  ErrorComponent.displayName = `ErrorComponent(${boundary})`;
  return ErrorComponent;
};

export const createNotFoundComponent = (boundary: BoundaryType, homePath?: string) => {
  const NotFoundComponent = () => <ErrorNotice boundary={boundary} error={pageNotFoundError()} homePath={homePath} />;
  NotFoundComponent.displayName = `NotFoundComponent(${boundary})`;
  return NotFoundComponent;
};

export function ErrorNoticePageComponent() {
  return <ErrorNotice boundary="public" />;
}

export function SpinnerPage() {
  return <Spinner size="lg" className="mt-[45vh]" />;
}
