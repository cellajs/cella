import { Bird } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import { useColumns } from './columns';

export interface ProjectRow {
  id: string;
  name: string;
  createdAt: string;
}

export default function ProjectsTable({ projects = [] }: { projects?: ProjectRow[] }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ProjectRow[]>(projects || []);

  const [columns] = useColumns();

  const onRowsChange = (records: ProjectRow[]) => {
    setRows(records);
  };

  return (
    <div className="space-y-4 h-full">
      <DataTable<ProjectRow>
        {...{
          columns: columns.filter((column) => column.visible),
          rows,
          limit: 10,
          rowHeight: 36,
          onRowsChange,
          rowKeyGetter: (row) => row.id,
          enableVirtualization: false,
          NoRowsComponent: <ContentPlaceholder Icon={Bird} title={t('common:no_resource_yet', { resource: t('common:projects').toLowerCase() })} />,
        }}
      />
    </div>
  );
}
