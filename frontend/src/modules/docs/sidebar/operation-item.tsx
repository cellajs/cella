import { memo } from 'react';
import type { GenOperationSummary } from 'sdk/docs-types';
import { Badge } from '~/modules/ui/badge';
import { getMethodColor } from '../helpers/get-method-color';
import { SidebarHashItem } from './sidebar-hash-item';

type OperationItemProps = { operation: GenOperationSummary; isActive: boolean };

function OperationItemBase({ operation, isActive }: OperationItemProps) {
  return (
    <SidebarHashItem to="/docs/operations" hash={operation.hash} isActive={isActive} className="justify-between">
      <span className="flex-1 truncate text-sm lowercase">{operation.summary || operation.id}</span>
      <Badge variant="secondary" className={`shrink-0 bg-transparent p-0 text-xs uppercase shadow-none ${getMethodColor(operation.method)}`}>
        {operation.method}
      </Badge>
    </SidebarHashItem>
  );
}

function operationItemEqual(prev: OperationItemProps, next: OperationItemProps) {
  return prev.operation === next.operation && prev.isActive === next.isActive;
}

export const OperationItem = memo(OperationItemBase, operationItemEqual);
