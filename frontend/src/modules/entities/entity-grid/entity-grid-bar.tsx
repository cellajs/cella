import type { QueryKey } from '@tanstack/react-query';
import { ArrowDownAZIcon, CalendarIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ChannelEntityType } from 'shared';
import type { TKey } from '~/lib/i18n-locales';
import { TableBarShell, useTableBarFilters } from '~/modules/common/data-table/table-bar-shell';
import { useRoleSearchFilter } from '~/modules/common/form-fields/use-role-search-filter';
import type { IconComponent } from '~/modules/common/icons/types';
import { gridPreviewLimit } from '~/modules/entities/entity-grid/base-entity-grid';
import { useListQueryTotal } from '~/query/basic/use-list-query-total';

type SortOrder = 'asc' | 'desc';

type EntityGridBarSearch = { q?: string; sort?: string; order?: SortOrder; role?: string };

// A picked sort writes its order too: the list's own default order may suit neither option
const sortOptions = [
  { name: 'c:alphabetical', icon: ArrowDownAZIcon, value: 'name', order: 'asc' },
  { name: 'c:created_at', icon: CalendarIcon, value: 'createdAt', order: 'desc' },
] satisfies { name: TKey; icon: IconComponent; value: string; order: SortOrder }[];

interface EntityGridBarProps {
  queryKey: QueryKey;
  label: TKey;
  /** Channel entity the grid lists; scopes the role filter to that entity's role vocabulary. */
  entityType: ChannelEntityType;
  searchVars: EntityGridBarSearch;
  setSearch: (search: EntityGridBarSearch) => void;
  /** Shows the focus view toggle (default false). */
  focusView?: boolean;
  /** Buttons before the count, such as a create button: hidden while filtered, shown alone while the bar hides. */
  actions?: ReactNode;
  /** A grid/table view toggle after the filters; it hides with the bar. */
  viewToggle?: ReactNode;
  /** Shows the role filter (default true); a discovery grid passes false, since a role narrows the backend scope to member rows. */
  roleFilter?: boolean;
  /** Keeps the bar at or below gridPreviewLimit while unfiltered (default false). */
  alwaysShow?: boolean;
}

export function EntityGridBar({
  queryKey,
  label,
  entityType,
  searchVars,
  setSearch,
  focusView = false,
  actions,
  viewToggle,
  roleFilter = true,
  alwaysShow = false,
}: EntityGridBarProps) {
  const { sort, role } = searchVars;

  const total = useListQueryTotal(queryKey);
  const barFilters = useTableBarFilters({ searchVars, setSearch, reset: { q: '', role: undefined } });
  const searchFilters = useRoleSearchFilter({ entityType, value: role, onChange: (role) => setSearch({ role }) });

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
      searchFilters={roleFilter ? searchFilters : undefined}
      sort={{
        options: sortOptions,
        value: sort ?? sortOptions[0].value,
        onChange: (sort) => setSearch({ sort, order: sortOptions.find((option) => option.value === sort)?.order }),
      }}
      controls={viewToggle}
      focusView={focusView}
    />
  );
}
