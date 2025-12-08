import { useLoaderData } from '@tanstack/react-router';
import { InfoIcon, TrashIcon, UploadIcon, XSquareIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Attachment } from '~/api.gen';
import DeleteAttachments from '~/modules/attachments/delete-attachments';
import type { AttachmentsTableProps } from '~/modules/attachments/table';
import { useAttachmentsUploadDialog } from '~/modules/attachments/table/helpers';
import type { AttachmentsRouteSearchParams } from '~/modules/attachments/types';
import { AlertWrap } from '~/modules/common/alert-wrap';
import ColumnsView from '~/modules/common/data-table/columns-view';
import { TableBarButton } from '~/modules/common/data-table/table-bar-button';
import { TableBarContainer } from '~/modules/common/data-table/table-bar-container';
import TableCount from '~/modules/common/data-table/table-count';
import { FilterBarActions, FilterBarContent, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import TableSearch from '~/modules/common/data-table/table-search';
import type { BaseTableBarProps } from '~/modules/common/data-table/types';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { FocusView } from '~/modules/common/focus-view';
import { OrganizationAttachmentsRoute } from '~/routes/organization-routes';

type AttachmentsTableBarProps = AttachmentsTableProps &
  Omit<BaseTableBarProps<Attachment, AttachmentsRouteSearchParams>, 'queryKey'> & {
    isCompact: boolean;
    setIsCompact: (isCompact: boolean) => void;
  };

export const AttachmentsTableBar = ({
  entity,
  selected,
  searchVars,
  setSearch,
  columns,
  setColumns,
  isCompact,
  setIsCompact,
  clearSelection,
  isSheet = false,
  canUpload = true,
}: AttachmentsTableBarProps) => {
  const { t } = useTranslation();
  const createDialog = useDialoger((state) => state.create);
  const { open } = useAttachmentsUploadDialog();
  // const { attachmentsCollection, localAttachmentsCollection } = useLoaderData({ from: OrganizationAttachmentsRoute.id });
  const { attachmentsCollection } = useLoaderData({ from: OrganizationAttachmentsRoute.id });

  // const total = attachmentsCollection.size + localAttachmentsCollection.size;
  const total = attachmentsCollection.size;

  const deleteButtonRef = useRef(null);

  const { q } = searchVars;

  const isFiltered = !!q;
  const showUpload = canUpload && !isFiltered;

  // Drop selected rows on search
  const onSearch = (searchString: string) => {
    clearSelection();
    setSearch({ q: searchString });
  };

  const onResetFilters = () => {
    setSearch({ q: '' });
    clearSelection();
  };

  const openDeleteDialog = () => {
    createDialog(<DeleteAttachments dialog attachments={selected} callback={clearSelection} />, {
      id: 'delete-attachments',
      triggerRef: deleteButtonRef,
      className: 'max-w-xl',
      title: t('common:remove_resource', { resource: t('common:attachments').toLowerCase() }),
      description: t('common:confirm.delete_counted_resource', {
        count: selected.length,
        resource: selected.length > 1 ? t('common:attachments').toLowerCase() : t('common:attachment').toLowerCase(),
      }),
    });
  };

  return (
    <div className={'flex flex-col gap-4'}>
      <TableBarContainer>
        {/* Filter bar */}
        <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
          <FilterBarActions>
            {selected.length > 0 ? (
              <>
                <TableBarButton
                  ref={deleteButtonRef}
                  variant="destructive"
                  onClick={openDeleteDialog}
                  className="relative"
                  badge={selected.length}
                  icon={TrashIcon}
                  label={t('common:delete')}
                />

                <TableBarButton variant="ghost" onClick={clearSelection} icon={XSquareIcon} label={t('common:clear')} />
              </>
            ) : (
              showUpload && <TableBarButton icon={UploadIcon} label={t('common:upload')} onClick={() => open(entity.id)} />
            )}
            {selected.length === 0 && <TableCount count={total} label="common:attachment" isFiltered={isFiltered} onResetFilters={onResetFilters} />}
          </FilterBarActions>
          <div className="sm:grow" />
          <FilterBarContent className="max-sm:animate-in max-sm:slide-in-from-left max-sm:fade-in max-sm:duration-300">
            <TableSearch name="attachmentSearch" value={q} setQuery={onSearch} allowOfflineSearch={true} />
          </FilterBarContent>
        </TableFilterBar>

        {/* Columns view */}
        <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} isCompact={isCompact} setIsCompact={setIsCompact} />

        {/* Focus view */}
        {!isSheet && <FocusView iconOnly />}
      </TableBarContainer>

      {/* Explainer alert box */}
      {!!total && (
        <AnimatePresence initial={false}>
          {
            <motion.div
              key="alert"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{
                height: { duration: 0.3 },
                opacity: { delay: 0.6, duration: 0.2 },
              }}
              style={{ overflow: 'hidden' }}
            >
              <AlertWrap id="edit_attachment" variant="plain" icon={InfoIcon}>
                {t('common:edit_attachment.text')}
              </AlertWrap>
            </motion.div>
          }
        </AnimatePresence>
      )}
    </div>
  );
};
