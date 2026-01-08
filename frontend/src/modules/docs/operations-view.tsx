import { useSearch } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';

const OperationsList = lazy(() => import('~/modules/docs/operations-list'));
const OperationsTable = lazy(() => import('~/modules/docs/table'));

/**
 * Wrapper component that renders either OperationsList or OperationsTable
 * based on the viewMode search parameter.
 */
const OperationsView = () => {
  const { viewMode = 'list' } = useSearch({ from: '/publicLayout/docs/' });

  return <Suspense>{viewMode === 'table' ? <OperationsTable /> : <OperationsList />}</Suspense>;
};

export default OperationsView;
