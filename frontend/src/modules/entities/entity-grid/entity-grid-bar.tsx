import type { QueryKey } from '@tanstack/react-query';
import { ArrowDownAZIcon, CalendarIcon, MenuIcon } from 'lucide-react';
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

type EntityGridBarSearch<TSort extends string> = { q?: string; sort: TSort; order?: SortOrder; role?: string };

/** One entry of a grid's sort menu; picking it writes its order too. */
export type GridSortOption<TSort extends string = string> = { name: TKey; icon: IconComponent; value: TSort; order: SortOrder };

/** The sorts a grid can offer; `displayOrder` is the caller's menu order, so only a grid of their own offers it. */
export const gridSortOptions = {
  displayOrder: { name: 'c:menu_order', icon: MenuIcon, value: 'displayOrder', order: 'asc' },
  name: { name: 'c:alphabetical', icon: ArrowDownAZIcon, value: 'name', order: 'asc' },
  createdAt: { name: 'c:created_at', icon: CalendarIcon, value: 'createdAt', order: 'desc' },
} as const satisfies Record<string, GridSortOption>;

/** A grid opens on its first sort option, so its default is always one the menu shows. */
export const gridSortDefaults = <TSort extends string>([first]: readonly [GridSortOption<TSort>, ...GridSortOption<TSort>[]]) => ({
  sort: first.value,
  order: first.order,
});

interface EntityGridBarProps<TSort extends string> {
  queryKey: QueryKey;
  label: TKey;
  /** Channel entity the grid lists; scopes the role filter to that entity's role vocabulary. */
  entityType: ChannelEntityType;
  searchVars: EntityGridBarSearch<TSort>;
  setSearch: (search: Partial<EntityGridBarSearch<TSort>>) => void;
  /** The sort menu; the grid's search opens on the first (`gridSortDefaults`). */
  sortOptions: readonly GridSortOption<TSort>[];
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

export function EntityGridBar<TSort extends string>({
  queryKey,
  label,
  entityType,
  searchVars,
  setSearch,
  sortOptions,
  focusView = false,
  action,
  viewToggle,
  roleFilter = true,
  alwaysShow = false,
}: EntityGridBarProps<TSort>) {
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
        value: sort,
        onChange: (value) => {
          const option = sortOptions.find((option) => option.value === value);
          if (option) setSearch({ sort: option.value, order: option.order });
        },
      }}
      controls={viewToggle}
      focusView={focusView}
    />
  );
}
