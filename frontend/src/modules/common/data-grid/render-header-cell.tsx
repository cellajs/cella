import { renderSortStatus } from './sort-status';
import type { RenderHeaderCellProps } from './types';

export function renderHeaderCell<R, SR>({ column, sortDirection, priority }: RenderHeaderCellProps<R, SR>) {
  if (!column.sortable) return column.name;

  return (
    <SortableHeaderCell sortDirection={sortDirection} priority={priority}>
      {column.name}
    </SortableHeaderCell>
  );
}

type SharedHeaderCellProps<R, SR> = Pick<RenderHeaderCellProps<R, SR>, 'sortDirection' | 'priority'>;

interface SortableHeaderCellProps<R, SR> extends SharedHeaderCellProps<R, SR> {
  children: React.ReactNode;
}

function SortableHeaderCell<R, SR>({ sortDirection, priority, children }: SortableHeaderCellProps<R, SR>) {
  return (
    <span className="flex">
      <span className="grow overflow-clip text-ellipsis">{children}</span>
      <span>{renderSortStatus({ sortDirection, priority })}</span>
    </span>
  );
}
