import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import type { GenOperationSummary } from 'sdk/docs-types';
import { TableBarShell, useTableBarFilters } from '~/modules/common/data-table/table-bar-shell';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { ResponsiveSelect } from '~/modules/common/form-fields/responsive-select';
import { upperFirst } from '~/modules/docs/helpers/upper-first';
import { mcpToolFilter } from '~/modules/docs/operations/operations-table/use-filtered-operations';
import { ViewModeToggle } from '~/modules/docs/operations/view-mode-toggle';

interface OperationsTableBarProps {
  total: number;
  searchVars: { q?: string; tag?: string };
  setSearch: (params: { q?: string; tag?: string }) => void;
  columns: ColumnOrColumnGroup<GenOperationSummary>[];
  setColumns: Dispatch<SetStateAction<ColumnOrColumnGroup<GenOperationSummary>[]>>;
  /** Tag-kind filter values found in the dataset, e.g. `{ owner: ['cella','app'] }`, one dropdown group each. */
  tagFilters: Record<string, string[]>;
  /** Whether any operation is an MCP tool, which adds the MCP tools option. */
  hasMcpTools: boolean;
}

/** Display order for tag-kind groups in the filter dropdown. */
const kindOrder = ['owner', 'entity'];

/** Human-readable label for a `${kind}:${value}` filter option. */
const labelFor = (kind: string, value: string): string => {
  const label = upperFirst(value);
  if (kind === 'entity') return `${label} entity`;
  return label;
};

export function OperationsTableBar({ total, searchVars, setSearch, columns, setColumns, tagFilters, hasMcpTools }: OperationsTableBarProps) {
  const { t } = useTranslation();
  const barFilters = useTableBarFilters({ searchVars, setSearch, reset: { q: '', tag: undefined } });

  const orderedKinds = [
    ...kindOrder.filter((kind) => tagFilters[kind]?.length),
    ...Object.keys(tagFilters).filter((kind) => !kindOrder.includes(kind) && tagFilters[kind]?.length),
  ];

  const tagOptions = orderedKinds.flatMap((kind) => tagFilters[kind].map((value) => ({ value: `${kind}:${value}`, label: labelFor(kind, value) })));
  const filterOptions = [
    { value: 'all', label: t('c:all') },
    ...tagOptions,
    ...(hasMcpTools ? [{ value: mcpToolFilter, label: t('c:docs.mcp_tools') }] : []),
  ];

  return (
    <TableBarShell
      {...barFilters}
      {...{ searchVars, total, columns, setColumns }}
      label="c:operation"
      searchName="operationsSearch"
      filters={
        <ResponsiveSelect
          options={filterOptions}
          value={searchVars.tag ?? 'all'}
          onChange={(value) => setSearch({ tag: value === 'all' ? undefined : value })}
          title={t('c:filter')}
          className="sm:min-w-32"
        />
      }
      controls={<ViewModeToggle />}
    />
  );
}
