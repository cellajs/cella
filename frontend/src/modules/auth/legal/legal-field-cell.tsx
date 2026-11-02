import { CornerDownRightIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { TableCell } from '~/modules/ui/table';
import { cn } from '~/utils/cn';

interface LegalFieldCellProps extends ComponentProps<typeof TableCell> {
  label: string;
}

/**
 * A cell that stacks under its row's name on a phone, where it names itself because the column header is out of view.
 * A legal table states its roles because `display: block` can strip them.
 */
export function LegalFieldCell({ label, className, children, ...props }: LegalFieldCellProps) {
  return (
    <TableCell role="cell" className={cn('whitespace-normal max-sm:mt-1 max-sm:block max-sm:p-0', className)} {...props}>
      <span className="group-label mr-0.5 sm:hidden">
        <CornerDownRightIcon className="mr-1 inline size-3.5 align-[-0.125em]" />
        {label}
      </span>{' '}
      {children}
    </TableCell>
  );
}
