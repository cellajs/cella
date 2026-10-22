import { Link, useNavigate } from '@tanstack/react-router';
import type { ComponentProps } from 'react';
import { scrollToSectionById } from '~/hooks/use-scroll-spy-store';
import { DataTable } from '~/modules/common/data-table/data-table';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { Badge } from '~/modules/ui/badge';
import { isModifiedClick } from '~/utils/is-modified-click';

interface TagHashLinkProps extends Pick<ComponentProps<'a'>, 'title' | 'dir' | 'children'> {
  /** Search param that records the expanded tag. */
  tagParam: 'operationTag' | 'schemaTag';
  tagName: string;
  hash: string;
  tabIndex: number;
}

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
      onClick={(event) => {
        if (isModifiedClick(event)) return;
        event.preventDefault();
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
        isFiltered={false}
        rowHeight={36}
        hideHeader={hideHeader}
        enableVirtualization={false}
        readOnly
      />
    </div>
  );
}

/** A tag-kind cell: one badge per tag. */
export function TagBadges({ values }: { values: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {values.map((tag) => (
        <Badge key={tag} variant="outline">
          {tag}
        </Badge>
      ))}
    </div>
  );
}

/** Distinct tag kinds across the items, in first-seen order, without the excluded ones. */
export function collectTagKinds(items: { tagsByKind: Record<string, string[]> }[], exclude: string[] = []) {
  const kinds = new Set<string>();
  for (const item of items) {
    for (const kind of Object.keys(item.tagsByKind)) if (!exclude.includes(kind)) kinds.add(kind);
  }
  return [...kinds];
}
