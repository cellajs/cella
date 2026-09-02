import { InfoIcon, TrashIcon, UploadIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Attachment } from 'sdk';
import { appConfig, hierarchy } from 'shared';
import { DeleteAttachments } from '~/modules/attachment/delete-attachments';
import type { AttachmentsTableProps } from '~/modules/attachment/table/attachments-table';
import { useAttachmentsUploadDialog } from '~/modules/attachment/table/use-attachments-upload-dialog';
import type { AttachmentsRouteSearchParams } from '~/modules/attachment/types';
import { AlertBanner } from '~/modules/common/alerter/alert-banner';
import { ColumnsView } from '~/modules/common/data-table/columns-view';
import { TableBarButton } from '~/modules/common/data-table/table-bar-button';
import { TableBarContainer } from '~/modules/common/data-table/table-bar-container';
import { TableCount } from '~/modules/common/data-table/table-count';
import { FilterBarActions, FilterBarSearch, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import { TableSearch } from '~/modules/common/data-table/table-search';
import type { BaseTableBarProps } from '~/modules/common/data-table/types';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { FocusView } from '~/modules/common/focus-view';
import { SelectionActionBar } from '~/modules/common/selection-action-bar';
import { useResolveCan } from '~/modules/entities/use-resolve-can';
import { useListQueryTotal } from '~/query/basic/use-list-query-total';

type AttachmentsTableBarProps = AttachmentsTableProps & BaseTableBarProps<Attachment, AttachmentsRouteSearchParams>;

export function AttachmentsTableBar({
  channel,
  selected,
  searchVars,
  setSearch,
  columns,
  setColumns,
  clearSelection,
  isSheet = false,
  canUpload = false,
  queryKey,
}: AttachmentsTableBarProps) {
  const { t } = useTranslation();
  const createDialog = useDialoger((state) => state.create);
  // Placement seam: a sub-organization channel homes its uploads on itself; the organization row is the org.
  const isRoot = channel.entityType === hierarchy.rootChannelType;
  const organizationId = !isRoot && 'organizationId' in channel ? String(channel.organizationId) : channel.id;
  const placement = isRoot ? undefined : { [appConfig.entityIdColumnKeys[channel.entityType]]: channel.id };
  const { open } = useAttachmentsUploadDialog(channel.tenantId, organizationId, placement);
  const resolveCan = useResolveCan();

  const deleteButtonRef = useRef(null);

  const total = useListQueryTotal(queryKey);

  const { q } = searchVars;

  const isFiltered = !!q;
  const showUpload = canUpload && !isFiltered;

  // Bulk delete acts only on rows this user may delete; the badge shows that count when it differs from the selection.
  const deletable = selected.filter((row) => resolveCan(channel.can?.attachment?.delete, row.createdBy));

  const onSearch = (searchString: string) => {
    clearSelection();
    setSearch({ q: searchString });
  };

  const onResetFilters = () => {
    setSearch({ q: '' });
    clearSelection();
  };

  const openDeleteDialog = () => {
    createDialog(<DeleteAttachments dialog attachments={deletable} callback={clearSelection} />, {
      id: 'delete-attachments',
      triggerRef: deleteButtonRef,
      className: 'max-w-xl',
      title: t('c:remove_resource', { resource: t('c:attachment_other').toLowerCase() }),
      description: t('c:confirm.delete_counted_resource', {
        count: deletable.length,
        resource: deletable.length > 1 ? t('c:attachment_other').toLowerCase() : t('c:attachment').toLowerCase(),
      }),
    });
  };

  return (
    <>
      <TableBarContainer searchVars={searchVars} offsetTop={48}>
        <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
          <FilterBarActions>
            {showUpload && <TableBarButton icon={UploadIcon} label="c:upload" onClick={() => open()} />}
            <TableCount count={total} label="c:attachment" isFiltered={isFiltered} onResetFilters={onResetFilters} />
          </FilterBarActions>
          <div className="sm:grow" />
          <FilterBarSearch>
            <TableSearch name="attachmentSearch" value={q} setQuery={onSearch} allowOfflineSearch={true} />
          </FilterBarSearch>
        </TableFilterBar>

        <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} />

        {!isSheet && <FocusView iconOnly />}
      </TableBarContainer>

      <SelectionActionBar count={selected.length} onClear={clearSelection}>
        {deletable.length > 0 && (
          <TableBarButton
            ref={deleteButtonRef}
            variant="destructive"
            onClick={openDeleteDialog}
            className="relative"
            badge={deletable.length < selected.length ? deletable.length : undefined}
            icon={TrashIcon}
            label="c:delete"
          />
        )}
      </SelectionActionBar>

      {!!total && (
        <AlertBanner id="edit_attachment" variant="plain" className="mb-4" icon={InfoIcon} animate>
          {t('c:edit_attachment.text')}
        </AlertBanner>
      )}
    </>
  );
}
