import { infiniteQueryOptions, useInfiniteQuery } from '@tanstack/react-query';
import type { getProjectsQuerySchema } from 'backend/modules/projects/schema';
import { Bird } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { SortColumn } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { type GetProjectsParams, getProjects } from '~/api/projects';
import { useDebounce } from '~/hooks/use-debounce';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import type { Project } from '~/types';
import { useColumns } from './columns';
import Toolbar from './toolbar';

export type ProjectsSearch = z.infer<typeof getProjectsQuerySchema>;

export const projectsQueryOptions = ({ q, sort: initialSort, order: initialOrder, limit, requestedUserId }: GetProjectsParams) => {
  const sort = initialSort || 'createdAt';
  const order = initialOrder || 'desc';

  return infiniteQueryOptions({
    queryKey: ['projects', q, sort, order],
    initialPageParam: 0,
    refetchOnWindowFocus: false,
    queryFn: async ({ pageParam: page, signal }) => await getProjects({ page, q, sort, order, limit, requestedUserId }, signal),
    getNextPageParam: (_lastPage, allPages) => allPages.length,
  });
};

const LIMIT = 40;

export default function ProjectsTable({ userId }: { userId?: string }) {
  const { t } = useTranslation();

  const [rows, setRows] = useState<Project[]>([]);
  const [selectedRows, setSelectedRows] = useState(new Set<string>());
  const [columns, setColumns] = useColumns();
  const [query, setQuery] = useState<GetProjectsParams['q']>('');
  const [sortColumns, setSortColumns] = useState<SortColumn[]>([{ columnKey: 'createdAt', direction: 'DESC' }]);

  const onRowsChange = (changedRows: Project[]) => {
    setRows(changedRows);
  };

  const onResetFilters = () => {
    setQuery('');
    setSelectedRows(new Set<string>());
  };

  // Search query options
  const q = useDebounce(query, 200);
  const sort = sortColumns[0]?.columnKey as ProjectsSearch['sort'];
  const order = sortColumns[0]?.direction.toLowerCase() as ProjectsSearch['order'];
  const limit = LIMIT;
  const requestedUserId = userId;

  // Query projects
  const queryResult = useInfiniteQuery(projectsQueryOptions({ q, sort, order, limit, requestedUserId }));

  // Total count
  const totalCount = queryResult.data?.pages[0].total;

  const isFiltered = !!q;

  useEffect(() => {
    const data = queryResult.data?.pages?.flatMap((page) => page.items);

    if (data) {
      setSelectedRows(new Set<string>([...selectedRows].filter((id) => data.some((row) => row.id === id))));
      setRows(data);
    }
  }, [queryResult.data]);

  return (
    <div className="space-y-4 h-full">
      <Toolbar
        total={totalCount}
        query={query}
        isFiltered={isFiltered}
        setQuery={setQuery}
        onResetSelectedRows={() => setSelectedRows(new Set<string>())}
        selectedProjects={rows.filter((row) => selectedRows.has(row.id))}
        onResetFilters={onResetFilters}
        callback={() => {}}
        columns={columns}
        setColumns={setColumns}
      />
      <DataTable<Project>
        {...{
          columns: columns.filter((column) => column.visible),
          rows,
          limit,
          rowHeight: 42,
          selectedRows,
          onRowsChange,
          onSelectedRowsChange: setSelectedRows,
          rowKeyGetter: (row) => row.id,
          enableVirtualization: false,
          onSortColumnsChange: setSortColumns,
          NoRowsComponent: <ContentPlaceholder Icon={Bird} title={t('common:no_resource_yet', { resource: t('common:projects').toLowerCase() })} />,
        }}
      />
    </div>
  );
}
