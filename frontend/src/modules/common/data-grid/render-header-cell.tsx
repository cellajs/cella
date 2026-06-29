import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from 'lucide-react';
import type { RenderHeaderCellProps } from './types';

export function renderHeaderCell<R, SR>({ column, sortDirection }: RenderHeaderCellProps<R, SR>) {
  if (!column.sortable) {
    return <div className="truncate">{column.name}</div>;
  }

  return (
    <div className="group flex cursor-pointer items-center gap-2">
      <span className="truncate">{column.name}</span>
      {sortDirection === 'DESC' ? (
        <ArrowDownIcon className="size-4 opacity-50 group-hover:opacity-75" />
      ) : sortDirection === 'ASC' ? (
        <ArrowUpIcon className="size-4 opacity-50 group-hover:opacity-75" />
      ) : (
        <ChevronsUpDownIcon className="size-4 opacity-50 group-hover:opacity-75" />
      )}
    </div>
  );
}
