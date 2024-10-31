import type { Attachment } from '~/types/common';

import { Link } from '@tanstack/react-router';
import { config } from 'config';
import type { TFunction } from 'i18next';
import { CopyCheckIcon, CopyIcon } from 'lucide-react';
import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';
import CheckboxColumn from '~/modules/common/data-table/checkbox-column';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/columns-view';
import HeaderCell from '~/modules/common/data-table/header-cell';
import { Button } from '~/modules/ui/button';
import { dateShort } from '~/utils/date-short';

export const useColumns = (t: TFunction<'translation', undefined>, isMobile: boolean, isAdmin: boolean, isSheet: boolean) => {
  const columns: ColumnOrColumnGroup<Attachment>[] = [
    ...(isAdmin ? [CheckboxColumn] : []),
    {
      key: 'name',
      name: t('common:filename'),
      visible: true,
      sortable: false,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row, tabIndex }) => (
        <Link
          className="flex space-x-2 items-center outline-0 ring-0 group"
          tabIndex={tabIndex}
          to="/$idOrSlug/attachments/$attachmentId"
          params={{
            idOrSlug: row.organizationId,
            attachmentId: row.id,
          }}
        >
          <span className="group-hover:underline underline-offset-4 truncate font-medium">{row.filename || '-'}</span>
        </Link>
      ),
    },
    {
      key: 'edit',
      name: '',
      visible: true,
      sortable: false,
      width: 32,
      renderCell: ({ row, tabIndex }) => {
        const { copyToClipboard, copied } = useCopyToClipboard();
        const shareLink = `${config.backendUrl}/${row.organizationId}/attachments/${row.id}/link`;
        return (
          <Button variant="cell" size="icon" tabIndex={tabIndex} className="h-full w-full" onClick={() => copyToClipboard(shareLink)}>
            {copied ? <CopyCheckIcon size={16} /> : <CopyIcon size={16} />}
          </Button>
        );
      },
    },
    {
      key: 'contentType',
      name: t('common:contentType'),
      sortable: true,
      visible: !isMobile,
      renderHeaderCell: HeaderCell,
      minWidth: 140,
      renderCell: ({ row, tabIndex }) => {
        return (
          <span tabIndex={tabIndex} className="font-light">
            {row.contentType || '-'}
          </span>
        );
      },
    },
    {
      key: 'size',
      name: t('common:size'),
      sortable: false,
      visible: !isMobile,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => <div className="inline-flex items-center gap-1 relative group h-full w-full">{row.size || '-'}</div>,
      width: 100,
    },
    {
      key: 'createdAt',
      name: t('common:created_at'),
      sortable: true,
      visible: !isSheet && !isMobile,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => dateShort(row.createdAt),
      minWidth: 180,
    },
  ];

  return columns;
};
