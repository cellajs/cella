import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import type { GenOperationSummary } from 'sdk/docs-types';
import { TableBarShell, useTableBarFilters } from '~/modules/common/data-table/table-bar-shell';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { ResponsiveSelect } from '~/modules/common/form-fields/responsive-select';
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

  return (
    <TableBarShell
      {...barFilters}
      {...{ total, columns, setColumns, sticky }}
      searchVars={search}
      label="c:operation"
      searchName="operationsSearch"
      allowOfflineSearch
      filters={
        filterOptions.length > 0 && (
          <ResponsiveSelect
            options={filterOptions}
            value={search.filter}
            onChange={(filter) => setSearch({ filter })}
            onClear={() => setSearch({ filter: undefined })}
            placeholder={t('c:filter')}
            title={t('c:filter_resource', { resource: t('c:operation', { count: 2 }) })}
            align="start"
            className="sm:min-w-32"
          />
        )
      }
      controls={<ViewModeToggle />}
    />
  );
}
