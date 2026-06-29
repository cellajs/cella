import { Link } from '@tanstack/react-router';
import { memo } from 'react';
import { scrollToSectionById } from '~/hooks/use-scroll-spy-store';
import type { GenOperationSummary } from '~/modules/docs/types';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';
import { useSheeter } from '../../common/sheeter/use-sheeter';
import { getMethodColor } from '../helpers/get-method-color';

type OperationItemProps = {
  operation: GenOperationSummary;
  isActive: boolean;
};

function OperationItemBase({ operation, isActive }: OperationItemProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(
        'h-8 w-full justify-between gap-2 pl-5 text-left font-normal text-sm opacity-70 hover:bg-accent/50',
        'data-[active=true]:opacity-100',
      )}
      render={
        <Link
          to="/docs/operations"
          hash={operation.hash}
          replace
          draggable={false}
          data-active={isActive}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey) return;
            e.preventDefault();
            scrollToSectionById(operation.hash);
            useSheeter.getState().remove('docs-sidebar');
          }}
        />
      }
    >
      <span className="flex-1 truncate text-sm lowercase">{operation.summary || operation.id}</span>
      <Badge
        variant="secondary"
        className={`shrink-0 bg-transparent p-0 text-xs uppercase shadow-none ${getMethodColor(operation.method)}`}
      >
        {operation.method}
      </Badge>
    </Button>
  );
}

function operationItemEqual(prev: OperationItemProps, next: OperationItemProps) {
  return prev.operation === next.operation && prev.isActive === next.isActive;
}

export const OperationItem = memo(OperationItemBase, operationItemEqual);
