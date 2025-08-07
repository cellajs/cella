import { useNavigate } from '@tanstack/react-router';
import { appConfig } from 'config';
import i18n from 'i18next';
import { Cloud, CloudOff, CopyCheckIcon, CopyIcon, Trash } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';
import DeleteAttachments from '~/modules/attachments/delete-attachments';
import { isFileLocal } from '~/modules/attachments/helpers/is-local-file';
import { formatBytes } from '~/modules/attachments/table/helpers';
import FilePlaceholder from '~/modules/attachments/table/preview/placeholder';
import type { LiveQueryAttachment } from '~/modules/attachments/types';
import CheckboxColumn from '~/modules/common/data-table/checkbox-column';
import HeaderCell from '~/modules/common/data-table/header-cell';
import TableEllipsis, { type EllipsisOption } from '~/modules/common/data-table/table-ellipsis';
import type { CallbackArgs, ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { PopConfirm } from '~/modules/common/popconfirm';
import { toaster } from '~/modules/common/toaster';
import type { EntityPage } from '~/modules/entities/types';
import { membersKeys } from '~/modules/memberships/query';
import { Button } from '~/modules/ui/button';
import { Input } from '~/modules/ui/input';
import { findUserFromCache } from '~/modules/users/helpers';
import UserCell from '~/modules/users/user-cell';
import { useUserStore } from '~/store/user';
import { dateShort } from '~/utils/date-short';

export const useColumns = (entity: EntityPage, isSheet: boolean, isCompact: boolean) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const storeUser = useUserStore((state) => state.user);
  const setTriggerRef = useDialoger((state) => state.setTriggerRef);

  const isMobile = useBreakpoints('max', 'sm', false);
  const isAdmin = entity.membership?.role === 'admin' || storeUser?.role === 'admin';

  const columns: ColumnOrColumnGroup<LiveQueryAttachment>[] = [
    CheckboxColumn,
    {
      key: 'thumbnail',
      name: '',
      visible: true,
      sortable: false,
      width: 32,
      renderCell: ({ row: { id, content_type, group_id } }) => {
        const cellRef = useRef<HTMLAnchorElement | null>(null);

        return (
          <Button
            className="p-0 w-full"
            variant="cell"
            onClick={() => {
              // Store trigger to bring focus back
              setTriggerRef(id, cellRef);

              navigate({
                to: '.',
                replace: false,
                resetScroll: false,
                search: (prev) => ({ ...prev, attachmentDialogId: id, groupId: group_id || undefined }),
              });
            }}
          >
            <FilePlaceholder contentType={content_type} />
          </Button>
        );
      },
    },
    {
      key: 'name',
      name: t('common:name'),
      editable: true,
      visible: true,
      sortable: true,
      minWidth: 180,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => <span className="font-medium">{row.name || '-'}</span>,
      ...(isAdmin && {
        renderEditCell: ({ row, onRowChange }) => (
          <Input value={row.name} onChange={(e) => onRowChange({ ...row, name: e.target.value })} autoFocus />
        ),
      }),
    },
    {
      key: 'storeType',
      name: '',
      visible: true,
      sortable: false,
      width: 32,
      renderCell: ({ row }) => {
        const isLocal = isFileLocal(row.original_key);
        return (
          <div
            className="flex justify-center items-center h-full w-full"
            data-tooltip="true"
            data-tooltip-content={isLocal ? t('common:local_only') : t('common:online')}
          >
            {isLocal ? <CloudOff className="opacity-50" size={16} /> : <Cloud className="text-success" size={16} />}
          </div>
        );
      },
    },
    {
      key: 'url',
      name: '',
      visible: !isMobile,
      sortable: false,
      width: 32,
      renderCell: ({ row, tabIndex }) => {
        const { copyToClipboard, copied } = useCopyToClipboard();
        if (isFileLocal(row.original_key)) return <div className="text-muted text-center w-full">-</div>;

        const shareLink = `${appConfig.backendUrl}/${row.organization_id}/attachments/${row.id}/link`;
        return (
          <Button
            variant="cell"
            size="icon"
            tabIndex={tabIndex}
            className="h-full w-full"
            aria-label="Copy"
            data-tooltip="true"
            data-tooltip-content={copied ? t('common:copied') : t('common:copy')}
            onClick={() => copyToClipboard(shareLink)}
          >
            {copied ? <CopyCheckIcon size={16} /> : <CopyIcon size={16} />}
          </Button>
        );
      },
    },
    // {
    //   key: 'download',
    //   name: '',
    //   visible: !isMobile,
    //   sortable: false,
    //   width: 32,
    //   renderCell: ({ row, tabIndex }) => {
    //     const { download, isInProgress } = useDownloader();
    //     if (!isCDNUrl(row.original_key)) return <div className="text-muted text-center w-full">-</div>;
    //     return (
    //       <Button
    //         variant="cell"
    //         size="icon"
    //         tabIndex={tabIndex}
    //         disabled={isInProgress}
    //         className="h-full w-full"
    //         aria-label="Download"
    //         data-tooltip="true"
    //         data-tooltip-content={t('common:download')}
    //         onClick={() => download(row.url, row.filename)}
    //       >
    //         {isInProgress ? <Spinner className="w-4 h-4 text-foreground/80" noDelay /> : <Download size={16} />}
    //       </Button>
    //     );
    //   },
    // },
    {
      key: 'ellipsis',
      name: '',
      visible: isMobile,
      sortable: false,
      width: 32,
      renderCell: ({ row, tabIndex }) => {
        const { copyToClipboard } = useCopyToClipboard();

        const isLocal = isFileLocal(row.original_key);
        if (isLocal) return <div className="text-muted text-center w-full">-</div>;
        const ellipsisOptions: EllipsisOption<LiveQueryAttachment>[] = [
          {
            label: i18n.t('common:delete'),
            icon: Trash,
            onSelect: (row) => {
              const { update } = useDropdowner.getState();
              const callback = ({ status }: CallbackArgs<LiveQueryAttachment[]>) => {
                if (status) useDropdowner.getState().remove();
              };

              update({
                content: (
                  <PopConfirm title={i18n.t('common:delete_confirm.text', { name: row.name })}>
                    <DeleteAttachments entity={entity} attachments={[row]} callback={callback} />
                  </PopConfirm>
                ),
              });
            },
          },
        ];

        if (isLocal) {
          const shareLink = `${appConfig.backendUrl}/${row.organization_id}/attachments/${row.id}/link`;

          ellipsisOptions.push({
            label: i18n.t('common:copy_url'),
            icon: CopyIcon,
            onSelect: () => {
              copyToClipboard(shareLink);
              toaster(t('common:success.copy_url'), 'success');
              useDropdowner.getState().remove();
            },
          });
        }

        return <TableEllipsis row={row} tabIndex={tabIndex} options={ellipsisOptions} />;
      },
    },
    {
      key: 'filename',
      name: t('common:filename'),
      visible: !isMobile,
      sortable: false,
      minWidth: 140,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => (
        <span className="group-hover:underline underline-offset-4 truncate font-light">{row.filename || <span className="text-muted">-</span>}</span>
      ),
    },
    {
      key: 'size',
      name: t('common:size'),
      sortable: true,
      visible: !isMobile,
      minWidth: 100,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => (
        <div className="inline-flex items-center gap-1 relative font-light group h-full w-full opacity-50">{formatBytes(row.size)}</div>
      ),
    },
    {
      key: 'created_at',
      name: t('common:created_at'),
      sortable: true,
      visible: !isSheet && !isMobile,
      minWidth: 160,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => (row.created_at ? dateShort(row.created_at) : <span className="text-muted">-</span>),
    },
    {
      key: 'created_by',
      name: t('common:created_by'),
      sortable: false,
      visible: false,
      minWidth: isCompact ? null : 120,
      width: isCompact ? 50 : null,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row, tabIndex }) => {
        if (!row.created_by) return <span className="text-muted">-</span>;

        const queryKey = [...membersKeys.table.base(), { entityType: entity.entityType, orgIdOrSlug: row.organization_id }];
        const user = findUserFromCache(queryKey, row.created_by);

        if (!user) return <span>{row.created_by}</span>;

        return <UserCell user={user} tabIndex={tabIndex} />;
      },
    },
    {
      key: 'modified_at',
      name: t('common:modified'),
      sortable: false,
      visible: false,
      minWidth: 160,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => (row.modified_at ? dateShort(row.modified_at) : <span className="text-muted">-</span>),
    },
    {
      key: 'modified_by',
      name: t('common:modified_by'),
      sortable: false,
      visible: false,
      width: isCompact ? 80 : 120,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row, tabIndex }) => {
        if (!row.modified_by) return <span className="text-muted">-</span>;

        const queryKey = [...membersKeys.table.base(), { entityType: entity.entityType, orgIdOrSlug: row.organization_id }];
        const user = findUserFromCache(queryKey, row.modified_by);

        if (!user) return <span>{row.modified_by}</span>;

        return <UserCell user={user} tabIndex={tabIndex} />;
      },
    },
  ];

  return columns;
};
