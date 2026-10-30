import { memo } from 'react';
import type { GenOperationSummary } from 'sdk/docs-types';
import { MethodLabel } from '~/modules/docs/operations/method-label';
import { filterOperations, useOperationSearch } from '~/modules/docs/operations/operations-filter';
import { SidebarHashItem } from '~/modules/docs/sidebar/sidebar-hash-item';

interface OperationItemProps {
  operation: GenOperationSummary;
  isActive: boolean;
}

function OperationItemBase({ operation, isActive }: OperationItemProps) {
  const search = useOperationSearch();

  return (
    <SidebarHashItem to="/docs/operations" hash={operation.hash} isActive={isActive} isHidden={!filterOperations([operation], search).length}>
      <span className="flex-1 truncate">{operation.summary || operation.id}</span>
      <MethodLabel method={operation.method} />
    </SidebarHashItem>
  );
}

export const OperationItem = memo(OperationItemBase);
