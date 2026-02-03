import { Link } from '@tanstack/react-router';
import { memo } from 'react';
import { scrollToSectionById } from '~/hooks/use-scroll-spy-store';
import type { GenOperationSummary } from '~/modules/docs/types';
import { Badge } from '~/modules/ui/badge';
import { buttonVariants } from '~/modules/ui/button';
import { cn } from '~/utils/cn';
import { useSheeter } from '../../common/sheeter/use-sheeter';
import { getMethodColor } from '../helpers/get-method-color';

type OperationItemProps = {
  operation: GenOperationSummary;
  isActive: boolean;
};

function OperationItemBase({ operation, isActive }: OperationItemProps) {
  return (
    <Link
      to="/docs/operations"
      hash={operation.hash}
      replace
      draggable="false"
      data-active={isActive}
      className={cn(
        buttonVariants({ variant: 'ghost', size: 'sm' }),
        'hover:bg-accent/50 w-full justify-between text-left pl-5 font-normal opacity-70 text-sm h-8 gap-2',
        'data-[active=true]:opacity-100',
      )}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey) return;
        e.preventDefault();
        scrollToSectionById(operation.hash);
        useSheeter.getState().remove('docs-sidebar');
      }}
    >
      <span className="truncate flex-1 text-[13px] lowercase">{operation.summary || operation.id}</span>
      <Badge
        variant="secondary"
        className={`text-[11px] p-0 shrink-0 sm:opacity-70 group-hover:opacity-100 uppercase bg-transparent shadow-none ${getMethodColor(operation.method)}`}
      >
        {operation.method}
      </Badge>
    </Link>
  );
}

function operationItemEqual(prev: OperationItemProps, next: OperationItemProps) {
  return prev.operation === next.operation && prev.isActive === next.isActive;
}

export const OperationItem = memo(OperationItemBase, operationItemEqual);
