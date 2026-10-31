import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import type { GenOperationSummary } from 'sdk/docs-types';
import { TableBarShell, useTableBarFilters } from '~/modules/common/data-table/table-bar-shell';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { useOperationFilterOptions } from '~/modules/docs/operations/operations-filter';
import { ViewModeToggle } from '~/modules/docs/operations/view-mode-toggle';
import type { OperationSearch } from '~/modules/docs/types';

interface OperationsBarProps {
  /** Every operation, unfiltered: the filter options and their counts come from it. */
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
              chips: pickedFilter ? [{ key: 'filter', label: pickedFilter.label, onRemove: () => setSearch({ filter: undefined }) }] : [],
            }
          : undefined
      }
      controls={<ViewModeToggle />}
    />
  );
}
