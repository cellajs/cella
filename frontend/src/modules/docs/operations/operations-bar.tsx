import { Link } from '@tanstack/react-router';
import { ListIcon, TableIcon } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import type { GenOperationSummary } from 'sdk/docs-types';
import { TableBarShell, useTableBarFilters } from '~/modules/common/data-table/table-bar-shell';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { useOperationFilterOptions } from '~/modules/docs/operations/operations-filter';
import type { OperationSearch } from '~/modules/docs/types';
import { SegmentedNav, segmentClassName } from '~/modules/ui/segmented-control';

/** The search goes along; the sort and the expanded tag belong to one view. */
const carrySearch = ({ q, filter }: OperationSearch) => ({ q, filter });

/** The path alone picks the active view: the current URL can hold search params the links do not carry. */
const activeOptions = { exact: true, includeSearch: false };

function ViewModeToggle() {
  const { t } = useTranslation();

  return (
    <SegmentedNav aria-label={t('c:view_mode')}>
      <TooltipButton toolTipContent={t('c:list_view')}>
        <Link to="/docs/operations" search={carrySearch} activeOptions={activeOptions} draggable={false} className={segmentClassName}>
          <ListIcon />
        </Link>
      </TooltipButton>
      <TooltipButton toolTipContent={t('c:table_view')}>
        <Link to="/docs/operations/table" search={carrySearch} activeOptions={activeOptions} draggable={false} className={segmentClassName}>
          <TableIcon />
        </Link>
      </TooltipButton>
    </SegmentedNav>
  );
}

interface OperationsBarProps {
  /** Unfiltered: the filter counts come from it. */
  operations: GenOperationSummary[];
  total: number;
  search: OperationSearch;
  setSearch: (values: OperationSearch) => void;
  columns?: ColumnOrColumnGroup<GenOperationSummary>[];
  setColumns?: Dispatch<SetStateAction<ColumnOrColumnGroup<GenOperationSummary>[]>>;
  sticky?: boolean;
}

/** The search, filter and view controls of both operations views. */
export function OperationsBar({ operations, total, search, setSearch, columns, setColumns, sticky }: OperationsBarProps) {
  const { t } = useTranslation();
  const barFilters = useTableBarFilters({ searchVars: search, setSearch, reset: { q: '', filter: undefined } });
  const filterOptions = useOperationFilterOptions(operations);
  const pickedFilter = filterOptions.find((option) => option.value === search.filter);

  return (
    <TableBarShell
      {...barFilters}
      {...{ total, columns, setColumns, sticky }}
      searchVars={search}
      label="c:operation"
      searchName="operationsSearch"
      allowOfflineSearch
      searchFilters={
        filterOptions.length > 0
          ? {
              groups: [
                {
                  key: 'filter',
                  label: t('c:filter_resource', { resource: t('c:operation', { count: 2 }) }),
                  options: filterOptions.map((option) => ({ ...option, isSelected: option.value === search.filter })),
                  onToggle: (filter) => setSearch({ filter: filter === search.filter ? undefined : filter }),
                },
              ],
              chips: pickedFilter
                ? [
                    {
                      key: 'filter',
                      group: 'filter',
                      value: pickedFilter.value,
                      label: pickedFilter.label,
                      onRemove: () => setSearch({ filter: undefined }),
                    },
                  ]
                : [],
            }
          : undefined
      }
      controls={<ViewModeToggle />}
    />
  );
}
