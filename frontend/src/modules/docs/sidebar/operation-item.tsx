import { memo } from 'react';
import type { GenOperationSummary } from 'sdk/docs-types';
import { MethodLabel } from '~/modules/docs/operations/method-label';
import { SidebarHashItem } from '~/modules/docs/sidebar/sidebar-hash-item';

type OperationItemProps = { operation: GenOperationSummary; isActive: boolean };

function OperationItemBase({ operation, isActive }: OperationItemProps) {
  return (
    <SidebarHashItem to="/docs/operations" hash={operation.hash} isActive={isActive} className="justify-between">
      <span className="flex-1 truncate text-sm lowercase">{operation.summary || operation.id}</span>
      <MethodLabel method={operation.method} />
    </SidebarHashItem>
  );
}

export const OperationItem = memo(OperationItemBase);
