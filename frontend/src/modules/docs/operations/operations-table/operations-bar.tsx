import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { ColumnsView } from '~/modules/common/data-table/columns-view';
import { TableBarContainer } from '~/modules/common/data-table/table-bar-container';
import { TableCount } from '~/modules/common/data-table/table-count';
import {
  FilterBarActions,
  FilterBarFilters,
  FilterBarSearch,
  TableFilterBar,
} from '~/modules/common/data-table/table-filter-bar';
import { TableSearch } from '~/modules/common/data-table/table-search';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { FocusView } from '~/modules/common/focus-view';
import { ViewModeToggle } from '~/modules/docs/operations/view-mode-toggle';
import type { GenOperationSummary } from '~/modules/docs/types';
import { ResponsiveSelect } from '~/modules/ui/responsive-select';

interface OperationsTableBarProps {
  total: number;
  searchVars: { q?: string; tag?: string };
  setSearch: (params: { q?: string; tag?: string }) => void;
  columns: ColumnOrColumnGroup<GenOperationSummary>[];
  setColumns: Dispatch<SetStateAction<ColumnOrColumnGroup<GenOperationSummary>[]>>;
  /**
   * Tag-kind filter values discovered in the dataset, e.g.
   * `{ ownership: ['cella', 'app'], entity: ['context', 'product'] }`.
   * Each entry becomes a group of options in the filter dropdown.
   */
  tagFilters: Record<string, string[]>;
}

/** Display order for tag-kind groups in the filter dropdown. */
const KIND_ORDER = ['ownership', 'entity'];

/** Human-readable label for a `${kind}:${value}` filter option. */
const labelFor = (kind: string, value: string): string => {
  const cap = value.replace(/^\w/, (c) => c.toUpperCase());
  if (kind === 'entity') return `${cap} entity`;
  return cap;
};

export const OperationsTableBar = ({
  total,
  searchVars,
  setSearch,
  columns,
  setColumns,
  tagFilters,
}: OperationsTableBarProps) => {
  const { t } = useTranslation();
  const { q, tag } = searchVars;

  const onSearch = (searchString: string) => {
    setSearch({ q: searchString });
  };

  const onFilterChange = (value: string) => {
    setSearch({ tag: value === 'all' ? undefined : value });
  };

  const onResetFilters = () => {
    setSearch({ q: '', tag: undefined });
  };

  const isFiltered = !!q || !!tag;

  const orderedKinds = [
    ...KIND_ORDER.filter((k) => tagFilters[k]?.length),
    ...Object.keys(tagFilters).filter((k) => !KIND_ORDER.includes(k) && tagFilters[k]?.length),
  ];

  const filterOptions = [
    { value: 'all', label: t('c:all') },
    ...orderedKinds.flatMap((kind) =>
      tagFilters[kind].map((value) => ({
        value: `${kind}:${value}`,
        label: labelFor(kind, value),
      })),
    ),
  ];

  return (
    <TableBarContainer searchVars={searchVars} offsetTop={0}>
      <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
        <FilterBarActions>
          <ViewModeToggle />
          <TableCount count={total} label="c:operation" isFiltered={isFiltered} onResetFilters={onResetFilters} />
        </FilterBarActions>

        <div className="sm:grow" />

        <FilterBarSearch>
          <TableSearch name="operationsSearch" value={q} setQuery={onSearch} />
        </FilterBarSearch>
        <FilterBarFilters>
          <ResponsiveSelect
            options={filterOptions}
            value={tag ?? 'all'}
            onChange={onFilterChange}
            title={t('c:filter')}
            className="h-10 w-auto sm:min-w-32"
          />
        </FilterBarFilters>
      </TableFilterBar>

      <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} />
      <FocusView iconOnly />
    </TableBarContainer>
  );
};
