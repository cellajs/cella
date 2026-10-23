import type { QueryKey } from '@tanstack/react-query';
import { ArrowDownAZIcon, CalendarIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ChannelEntityType } from 'shared';
import type { TKey } from '~/lib/i18n-locales';
import { TableBarShell, useTableBarFilters } from '~/modules/common/data-table/table-bar-shell';
import { SelectRole } from '~/modules/common/form-fields/select-role';
import { SelectSort } from '~/modules/common/form-fields/select-sort';
import type { IconComponent } from '~/modules/common/icons/types';
import { gridPreviewLimit } from '~/modules/entities/entity-grid/base-entity-grid';
import { useListQueryTotal } from '~/query/basic/use-list-query-total';

type EntityGridBarSearch = { q?: string; sort?: string; role?: string };

const sortOptions = [
  { name: 'c:alphabetical', icon: ArrowDownAZIcon, value: 'name' },
  { name: 'c:created_at', icon: CalendarIcon, value: 'createdAt' },
] satisfies { name: TKey; icon: IconComponent; value: string }[];

interface EntityGridBarProps {
  queryKey: QueryKey;
  label: TKey;
  /** Channel entity the grid lists; scopes the role filter to that entity's role vocabulary. */
  entityType: ChannelEntityType;
  searchVars: EntityGridBarSearch;
  setSearch: (search: EntityGridBarSearch) => void;
  focusView?: boolean;
  /** Slot for surface actions (e.g. a create button), rendered before the count while unfiltered. */
  actions?: ReactNode;
  /** Always-rendered slot for a grid/table view toggle, placed after the filter bar. */
  viewToggle?: ReactNode;
  /**
   * Show the role filter (default true). Discovery-scoped grids pass false: a role filter
   * collapses the backend scope to membership-only rows.
   */
  roleFilter?: boolean;
  /** Render the bar even at or below gridPreviewLimit while unfiltered (default false). */
  alwaysShow?: boolean;
}

export function EntityGridBar({
  queryKey,
  label,
  entityType,
  searchVars,
  setSearch,
  focusView,
  actions,
  viewToggle,
  roleFilter = true,
  alwaysShow = false,
}: EntityGridBarProps) {
  const { sort, role } = searchVars;

  const total = useListQueryTotal(queryKey);
  const barFilters = useTableBarFilters({ searchVars, setSearch, reset: { q: '', role: undefined } });

  // Hide the bar at or below the preview count while unfiltered; the actions slot stays rendered
  if (!alwaysShow && !barFilters.isFiltered && (total ?? 0) <= gridPreviewLimit) {
    return actions ? <div className="flex items-center">{actions}</div> : null;
  }

  return (
    <TableBarShell
      {...barFilters}
      searchVars={searchVars}
      total={total}
      label={label}
      searchName="entitySearch"
      actions={actions}
      filters={
        <>
          <SelectSort value={sort ?? sortOptions[0].value} onChange={(sort) => setSearch({ sort })} sortOptions={sortOptions} />
          {roleFilter && <SelectRole entityType={entityType} value={role} onChange={(role) => setSearch({ role })} />}
        </>
      }
      controls={viewToggle}
      focusView={!!focusView}
    />
  );
}
