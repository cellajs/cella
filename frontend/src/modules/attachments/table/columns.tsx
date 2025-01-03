import type { Attachment } from '~/types/common';

import { config } from 'config';
import type { TFunction } from 'i18next';
import { CopyCheckIcon, CopyIcon } from 'lucide-react';
import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';
import AttachmentThumb from '~/modules/attachments/attachment-thumb';
import { formatBytes } from '~/modules/attachments/table/helpers';
import CheckboxColumn from '~/modules/common/data-table/checkbox-column';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/columns-view';
import HeaderCell from '~/modules/common/data-table/header-cell';
import { Button } from '~/modules/ui/button';
import { Input } from '~/modules/ui/input';
import { dateShort } from '~/utils/date-short';

export const useColumns = (
  t: TFunction<'translation', undefined>,
  isMobile: boolean,
  isAdmin: boolean,
  isSheet: boolean,
  openDialog: (slide: number) => void,
) => {
  const columns: ColumnOrColumnGroup<Attachment>[] = [
    ...(isAdmin ? [CheckboxColumn] : []),
    {
      key: 'thumbnail',
      name: '',
      visible: true,
      sortable: false,
      width: 32,
      renderCell: ({ row: { url, filename, contentType }, rowIdx }) => (
        <AttachmentThumb url={url} name={filename} openDialog={() => openDialog(rowIdx)} contentType={contentType} />
      ),
    },
    {
      key: 'name',
      name: t('common:name'),
      editable: true,
      visible: true,
      sortable: false,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => <strong>{row.name || '-'}</strong>,
      ...(isAdmin && {
        renderEditCell: ({ row, onRowChange }) => (
          <Input value={row.name} onChange={(e) => onRowChange({ ...row, name: e.target.value })} autoFocus />
        ),
      }),
    },
    {
      key: 'filename',
      name: t('common:filename'),
      visible: !isMobile,
      sortable: false,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row, tabIndex }) => (
        <span tabIndex={tabIndex} className="group-hover:underline underline-offset-4 truncate font-light">
          {row.filename || '-'}
        </span>
      ),
    },
    {
      key: 'URL',
      name: 'URL',
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
      name: t('common:content_type'),
      sortable: false,
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
      renderCell: ({ row }) => <div className="inline-flex items-center gap-1 relative group h-full w-full">{formatBytes(row.size)}</div>,
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
