import type { QueryKey } from '@tanstack/react-query';
import { ArrowDownAZIcon, CalendarIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ChannelEntityType } from 'shared';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import type { TKey } from '~/lib/i18n-locales';
import { type TableBarAction, TableBarActionButton, TableBarShell, useTableBarFilters } from '~/modules/common/data-table/table-bar-shell';
import { useRoleSearchFilter } from '~/modules/common/form-fields/use-role-search-filter';
import type { IconComponent } from '~/modules/common/icons/types';
import { gridPreviewLimit } from '~/modules/entities/entity-grid/base-entity-grid';
import { FloatingAction } from '~/modules/navigation/floating-nav/floating-action';
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
  /** The list's main action, such as create: on a phone a floating button, from `sm` up shown alone while the bar hides. */
  action?: TableBarAction;
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
  action,
  viewToggle,
  roleFilter = true,
  alwaysShow = false,
}: EntityGridBarProps) {
  const { sort, role } = searchVars;
  const isMobile = useBreakpointBelow('sm');

  const total = useListQueryTotal(queryKey);
  const barFilters = useTableBarFilters({ searchVars, setSearch, reset: { q: '', role: undefined } });
  const searchFilters = useRoleSearchFilter({ entityType, value: role, onChange: (role) => setSearch({ role }) });

  if (!alwaysShow && !barFilters.isFiltered && (total ?? 0) <= gridPreviewLimit) {
    if (!action) return null;
    if (isMobile) return <FloatingAction {...action} />;
    return (
      <div className="flex items-center">
        <TableBarActionButton action={action} />
      </div>
    );
  }

  return (
    <TableBarShell
      {...barFilters}
      searchVars={searchVars}
      total={total}
      label={label}
      searchName="entitySearch"
      action={action}
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
