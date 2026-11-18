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

type EntityGridBarSearch<TOrderBy extends string> = { q?: string; orderBy: TOrderBy; role?: string };

/** One entry of a grid's sort menu: the list query's `orderBy` it writes. */
export type GridSortOption<TOrderBy extends string = string> = { name: TKey; icon: IconComponent; value: TOrderBy };

/** The sorts a grid can offer; `displayOrder` is the caller's menu order, so only a grid of their own offers it. */
export const gridSortOptions = {
  displayOrder: { name: 'c:menu_order', icon: MenuIcon, value: 'displayOrder asc' },
  name: { name: 'c:alphabetical', icon: ArrowDownAZIcon, value: 'name asc' },
  createdAt: { name: 'c:created_at', icon: CalendarIcon, value: 'createdAt desc' },
} as const satisfies Record<string, GridSortOption>;

/** A grid opens on its first sort option, so its default is always one the menu shows. */
export const gridSortDefaults = <TOrderBy extends string>([first]: readonly [GridSortOption<TOrderBy>, ...GridSortOption<TOrderBy>[]]) => ({
  orderBy: first.value,
});

interface EntityGridBarProps<TOrderBy extends string> {
  queryKey: QueryKey;
  label: TKey;
  /** Scopes the role filter to this entity's roles. */
  entityType: ChannelEntityType;
  searchVars: EntityGridBarSearch<TOrderBy>;
  setSearch: (search: Partial<EntityGridBarSearch<TOrderBy>>) => void;
  /** The first is the default (`gridSortDefaults`). */
  sortOptions: readonly GridSortOption<TOrderBy>[];
  focusView?: boolean;
  /** A floating button on a phone; from `sm` up it stays while the bar hides. */
  action?: TableBarAction;
  /** Hides with the bar. */
  viewToggle?: ReactNode;
  /** A discovery grid passes false: a role narrows the backend scope to member rows. */
  roleFilter?: boolean;
  /** Shows the bar at or below gridPreviewLimit while unfiltered. */
  alwaysShow?: boolean;
}

export function EntityGridBar<TOrderBy extends string>(props: EntityGridBarProps<TOrderBy>) {
  const { searchVars, setSearch, sortOptions, focusView = false, action, roleFilter = true, alwaysShow = false } = props;
  const { orderBy, role } = searchVars;
  const isMobile = useBreakpointBelow('sm');

  const total = useListQueryTotal(props.queryKey);
  const barFilters = useTableBarFilters({ searchVars, setSearch, reset: { q: '', role: undefined } });
  const searchFilters = useRoleSearchFilter({ entityType: props.entityType, value: role, onChange: (role) => setSearch({ role }) });

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
      {...{ searchVars, total, action, focusView }}
      label={props.label}
      searchName="entitySearch"
      searchFilters={roleFilter ? searchFilters : undefined}
      sort={{
        options: sortOptions,
        value: orderBy,
        onChange: (value) => {
          const option = sortOptions.find((option) => option.value === value);
          if (option) setSearch({ orderBy: option.value });
        },
      }}
      controls={props.viewToggle}
    />
  );
}
