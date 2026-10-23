import { MailboxIcon, PlusIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { TableBarButton } from '~/modules/common/data-table/table-bar-button';
import { TableBarShell, useTableBarFilters } from '~/modules/common/data-table/table-bar-shell';
import type { BaseTableBarProps } from '~/modules/common/data-table/types';
import { type SheetTab, SheetTabs } from '~/modules/common/sheet-tabs';
import { sheeter } from '~/modules/common/sheeter/use-sheeter';
import { UnsavedBadge } from '~/modules/common/unsaved-badge';
import { openCreateOrganizationDialog } from '~/modules/organization/create-organization-form';
import { fetchOrganizationsForExport } from '~/modules/organization/query';
import type { EnrichedOrganization, OrganizationsRouteSearchParams } from '~/modules/organization/types';
import { CreateNewsletterForm } from '~/modules/system/create-newsletter-form';
import { NewsletterPreview } from '~/modules/system/newsletter-preview';
import { useListQueryTotal } from '~/query/basic/use-list-query-total';
import { tw } from '~/utils/tw';

type OrganizationsTableBarProps = BaseTableBarProps<EnrichedOrganization, OrganizationsRouteSearchParams>;

export function OrganizationsTableBar({
  selected,
  queryKey,
  searchVars,
  setSearch,
  columns,
  setColumns,
  clearSelection,
}: OrganizationsTableBarProps) {
  const { t } = useTranslation();

  const total = useListQueryTotal(queryKey);

  const createButtonRef = useRef(null);
  const newsletterButtonRef = useRef(null);

  const { q, order, sort } = searchVars;
  const barFilters = useTableBarFilters({ searchVars, setSearch, clearSelection, reset: { q: '' } });

  const openNewsletterSheet = () => {
    const ids = selected.map(({ id }) => id);
    const newsletterTabs: SheetTab[] = [
      {
        id: 'write',
        label: 'c:write',
        element: <CreateNewsletterForm organizationIds={ids} callback={clearSelection} />,
      },
      { id: 'preview', label: 'c:preview', element: <NewsletterPreview /> },
    ];

    sheeter.getState().create(<SheetTabs tabs={newsletterTabs} />, {
      id: 'create-newsletter',
      side: 'right',
      triggerRef: newsletterButtonRef,
      className: tw('max-w-full lg:max-w-4xl'),
      title: t('c:newsletter'),
      titleContent: <UnsavedBadge title={t('c:newsletter')} />,
      description: t('c:newsletter.text'),
      onClose: clearSelection,
    });
  };

  const fetchExport = async (limit: number, offset: number) => {
    return fetchOrganizationsForExport({ limit, offset, q, sort, order });
  };

  return (
    <TableBarShell
      {...barFilters}
      {...{ searchVars, total, columns, setColumns }}
      label="c:organization"
      searchName="organizationSearch"
      actions={
        <TableBarButton ref={createButtonRef} label="c:create" icon={PlusIcon} onClick={() => openCreateOrganizationDialog(createButtonRef)} />
      }
      export={{ filename: `${appConfig.slug}-organizations`, selectedRows: selected, fetchRows: fetchExport }}
      selection={{
        count: selected.length,
        onClear: clearSelection,
        children: <TableBarButton ref={newsletterButtonRef} onClick={openNewsletterSheet} label="c:newsletter" icon={MailboxIcon} />,
      }}
    />
  );
}
