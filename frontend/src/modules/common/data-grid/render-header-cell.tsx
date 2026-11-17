import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from 'lucide-react';
import { cn } from '~/utils/cn';
import type { RenderHeaderCellProps } from './types';

export function renderHeaderCell<R, SR>({ column, sortDirection }: RenderHeaderCellProps<R, SR>) {
  const { icon: Icon } = column;
  const SortIcon = sortDirection === 'DESC' ? ArrowDownIcon : sortDirection === 'ASC' ? ArrowUpIcon : ChevronsUpDownIcon;

  if (!Icon) {
    if (!column.sortable) return <div className="truncate">{column.name}</div>;

    return (
      <div className="group flex cursor-pointer items-center gap-2">
        <span className="truncate">{column.name}</span>
        <SortIcon className="size-4 opacity-70 group-hover:opacity-100" />
      </div>
    );
  }

  // Below 6rem the icon takes the name's place; the name moves to the header's tooltip and stays for screen readers.
  // Only an icon header is a container: its zero intrinsic width would leave a name out of a column's fit-to-content.
  return (
    <div className="@container w-full min-w-0">
      <div className={cn('group flex min-w-0 items-center gap-2', column.sortable && 'cursor-pointer')}>
        <Icon data-slim-icon aria-hidden className="hidden size-4 shrink-0 @max-[6rem]:block" />
        <span className="truncate @max-[6rem]:sr-only">{column.name}</span>
        {column.sortable && <SortIcon className="size-4 shrink-0 opacity-70 group-hover:opacity-100" />}
      </div>
    </div>
  );
}
