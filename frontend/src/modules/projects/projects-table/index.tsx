import { Bird } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import { useColumns } from './columns';
import type { ProjectRow } from '~/types';
import Toolbar from './toolbar';
import type { getProjectsQuerySchema } from 'backend/modules/projects/schema';
import type { z } from 'zod';
import { getProjects, type GetProjectsParams } from '~/api/projects';
import { useDebounce } from '~/hooks/use-debounce';
import type { SortColumn } from 'react-data-grid';
import { useInfiniteQuery } from '@tanstack/react-query';

export type ProjectsSearch = z.infer<typeof getProjectsQuerySchema>;

export default function ProjectsTable({ projects = [] }: { projects?: ProjectRow[] }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ProjectRow[]>(projects || []);
  const [selectedRows, setSelectedRows] = useState(new Set<string>());
  const [columns, setColumns] = useColumns();
  const [query, setQuery] = useState<GetProjectsParams['q']>('');
  const [sortColumns, setSortColumns] = useState<SortColumn[]>([{ columnKey: 'createdAt', direction: 'DESC' }]);

  const onRowsChange = (records: ProjectRow[]) => {
    setRows(records);
  };

  const onResetFilters = () => {
    setQuery('');
    setSelectedRows(new Set<string>());
  };

  const debounceQuery = useDebounce(query, 300);

  const queryResult = useInfiniteQuery({
    queryKey: ['projects', debounceQuery, sortColumns],
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) => {
      const fetchedData = await getProjects(
        {
          page: pageParam,
          q: debounceQuery,
          sort: sortColumns[0]?.columnKey as GetProjectsParams['sort'],
          order: sortColumns[0]?.direction.toLowerCase() as GetProjectsParams['order'],
          limit: 10,
        },
        signal,
      );
      return fetchedData;
    },
    getNextPageParam: (_lastGroup, groups) => groups.length,
    refetchOnWindowFocus: false,
  });
  const isFiltered = !!debounceQuery;

  console.log('queryResult:', queryResult);
  useEffect(() => {
    const data = queryResult.data?.pages?.flatMap((page) => page.items);

    if (data) {
      setSelectedRows(new Set<string>([...selectedRows].filter((id) => data.some((row) => row.id === id))));
      setRows(data);
    }
  }, [queryResult.data]);

  // // Save filters in search params
  // const filters = useMemo(
  //   () => ({
  //     q: debounceQuery,
  //     sort: sortColumns[0]?.columnKey,
  //     order: sortColumns[0]?.direction.toLowerCase(),
  //   }),
  //   [debounceQuery, sortColumns],
  // );

  // useSaveInSearchParams(filters, { sort: 'createdAt', order: 'desc' });

  return (
    <div className="space-y-4 h-full">
      <Toolbar
        total={queryResult.data?.pages?.[0]?.total}
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
      <DataTable<ProjectRow>
        {...{
          columns: columns.filter((column) => column.visible),
          rows,
          limit: 10,
          rowHeight: 36,
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
