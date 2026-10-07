import { Link, useNavigate } from '@tanstack/react-router';
import type { ComponentProps } from 'react';
import { scrollToSectionById } from '~/hooks/use-scroll-spy-store';
import { DataTable } from '~/modules/common/data-table/data-table';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';

type TagHashLinkProps = Pick<ComponentProps<'a'>, 'title' | 'dir' | 'children'> & {
  /** Search param that records the expanded tag. */
  tagParam: 'operationTag' | 'schemaTag';
  tagName: string;
  hash: string;
  tabIndex: number;
};

/** Cell-filling row link to a section of the tag list: enqueues the scroll (the store retries until laid out), then navigates. */
export function TagHashLink({ tagParam, tagName, hash, tabIndex, title, dir, children }: TagHashLinkProps) {
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
      title={title}
      className="group/link flex h-full min-w-0 flex-1 items-center font-mono text-sm outline-hidden"
    >
      {/* The underline sits on the text alone, while the whole cell takes the click */}
      <span
        dir={dir}
        className="group-active/link:press link-decoration group-active/link:link-decoration-strong min-w-0 flex-1 truncate text-left group-hover/link:underline"
      >
        {children}
      </span>
    </Link>
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
