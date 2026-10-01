import { Link, useNavigate } from '@tanstack/react-router';
import type { ComponentProps } from 'react';
import { scrollToSectionById } from '~/hooks/use-scroll-spy-store';
import { DataTable } from '~/modules/common/data-table/data-table';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { cn } from '~/utils/cn';

type TagHashLinkProps = Pick<ComponentProps<'a'>, 'title' | 'dir' | 'className' | 'children'> & {
  /** Search param that records the expanded tag. */
  tagParam: 'operationTag' | 'schemaTag';
  tagName: string;
  hash: string;
  tabIndex: number;
};

/** Row link to a section of the tag list: enqueues the scroll (the store retries until laid out), then navigates. */
export function TagHashLink({ tagParam, tagName, hash, tabIndex, className, ...props }: TagHashLinkProps) {
  const navigate = useNavigate();
  const search = (prev: Record<string, unknown>) => ({ ...prev, [tagParam]: tagName });

  return (
    <Link
      to="."
      search={search}
      hash={hash}
      replace
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey) return;
        e.preventDefault();
        scrollToSectionById(hash);
        navigate({ to: '.', search, hash, replace: true, resetScroll: false });
      }}
      resetScroll={false}
      draggable={false}
      tabIndex={tabIndex}
      className={cn('truncate font-mono text-sm decoration-foreground/30 underline-offset-3 hover:underline', className)}
      {...props}
    />
  );
}

interface TagTableProps<T> {
  rows: T[];
  columns: ColumnOrColumnGroup<T>[];
  rowKeyGetter: (row: T) => string;
  hideHeader?: boolean;
  /** Called on hover/focus to trigger prerendering of this tag's details. */
  onPrerender?: () => void;
}

/** Static read-only table of one tag's operations or schemas. */
export function TagTable<T>({ rows, columns, rowKeyGetter, hideHeader, onPrerender }: TagTableProps<T>) {
  return (
    <div onMouseEnter={onPrerender} onFocus={onPrerender}>
      <DataTable<T>
        className="mb-0"
        columns={columns}
        rows={rows}
        hasNextPage={false}
        rowKeyGetter={rowKeyGetter}
        isLoading={false}
        isFetching={false}
        limit={rows.length}
        isFiltered={false}
        rowHeight={36}
        hideHeader={hideHeader}
        enableVirtualization={false}
        readOnly
      />
    </div>
  );
}
