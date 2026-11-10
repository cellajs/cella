import { type ComponentType, type ReactNode, Suspense } from 'react';
import { PageSpinner } from '~/modules/common/spinner';

/** Gives a page its own Suspense boundary, so a query it suspends on falls back inside the layout and not above it. */
export const withSuspense = (Component: ComponentType, fallback?: ReactNode) => {
  const Wrapped = () => (
    <Suspense fallback={fallback}>
      <Component />
    </Suspense>
  );
  Wrapped.displayName = `withSuspense(${Component.displayName || Component.name || 'Component'})`;
  return Wrapped;
};

export const withSuspenseSpinner = (Component: ComponentType) => withSuspense(Component, <PageSpinner />);
