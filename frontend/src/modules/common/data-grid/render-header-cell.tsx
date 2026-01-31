import { useDefaultRenderers } from './data-grid-default-renderers-context';
import type { RenderHeaderCellProps } from './types';

const headerSortCellClassname = 'rdg-header-sort-cell';
const headerSortNameClassname = 'rdg-header-sort-name';

export default function renderHeaderCell<R, SR>({ column, sortDirection, priority }: RenderHeaderCellProps<R, SR>) {
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
  const renderSortStatus = useDefaultRenderers<R, SR>()!.renderSortStatus!;

  return (
    <span className={headerSortCellClassname}>
      <span className={headerSortNameClassname}>{children}</span>
      <span>{renderSortStatus({ sortDirection, priority })}</span>
    </span>
  );
}
