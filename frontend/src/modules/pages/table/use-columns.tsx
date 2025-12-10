import { Link } from '@tanstack/react-router';
import { FileArchiveIcon, FileCheckIcon, FilePenLineIcon, LucideProps } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Page } from '~/api.gen';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import CheckboxColumn from '~/modules/common/data-table/checkbox-column';
import HeaderCell from '~/modules/common/data-table/header-cell';
import { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { PageStatus } from '~/modules/pages/types';
import { UserCellById } from '~/modules/users/user-cell';
import { dateShort } from '~/utils/date-short';

const statusColors = {
  unpublished: 'text-blue-500',
  published: 'text-green-500',
  archived: 'text-grey-500',
} as const satisfies Record<PageStatus, string>;

type LucideIcon = React.ForwardRefExoticComponent<Omit<LucideProps, 'ref'> & React.RefAttributes<SVGSVGElement>>;

export const statusIcons = {
  unpublished: FilePenLineIcon,
  published: FileCheckIcon,
  archived: FileArchiveIcon,
} satisfies Record<PageStatus, LucideIcon>;

export const usePagesTableColumns = (isCompact: boolean) => {
  const { t } = useTranslation();
  const isMobile = useBreakpoints('max', 'sm', false);

  const configs: ColumnOrColumnGroup<Page>[] = [
    CheckboxColumn,
    {
      key: 'title',
      name: t('common:title'),
      visible: true,
      minWidth: 200,
      sortable: true,
      resizable: true,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row, tabIndex }) => (
        <Link
          // TODO
          // @ts-ignore
          to="/pages"
          draggable="false"
          tabIndex={tabIndex}
          // params={{ idOrSlug: row.slug }}
          className="flex space-x-2 items-center outline-0 ring-0 group"
        >
          {/* <AvatarWrap
            type="organization"
            className="h-8 w-8 group-active:translate-y-[.05rem]"
            id={row.id}
            name={row.name}
            url={row.thumbnailUrl}
          /> */}
          <span className="group-hover:underline underline-offset-3 decoration-foreground/20 group-active:decoration-foreground/50 group-active:translate-y-[.05rem] truncate font-medium">
            {row.name}
          </span>
        </Link>
      ),
    },
    {
      key: 'status',
      name: t('common:status'),
      editable: true,
      visible: !isMobile,
      sortable: true,
      resizable: true,
      width: 160,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => {
        const colorClasses = statusColors[row.status];
        const Icon = statusIcons[row.status];

        return (
          <>
            <Icon className={`size-4 mr-2 fill-current ${colorClasses}`} aria-hidden="true" />
            <span className={colorClasses}>{t(`app:${row.status}`)}</span>
          </>
        );
      },
    },
    {
      key: 'createdBy',
      name: t('common:created_by'),
      sortable: false,
      visible: true,
      resizable: true,
      minWidth: isCompact ? null : 120,
      width: isCompact ? 50 : null,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row, tabIndex }) => <UserCellById userId={row.createdBy} cacheOnly={false} tabIndex={tabIndex} />,
    },
    {
      key: 'createdAt',
      name: t('common:created_at'),
      sortable: true,
      visible: !isMobile,
      resizable: true,
      minWidth: 160,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => (row.createdAt ? dateShort(row.createdAt) : <span className="text-muted">-</span>),
    },
  ];

  const [columns, setColumns] = useState(configs);

  return {
    columns,
    visibleColumns: columns.filter((column) => column.visible),
    setColumns,
  };
};
