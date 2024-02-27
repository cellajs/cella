import { ChangeEvent, Dispatch, SetStateAction, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { getOrganizations } from '~/api/organizations';
import Export from '~/modules/common/data-table/export';
import CreateOrganizationForm from '~/modules/organizations/create-organization-form';
import DeleteOrganizations from '~/modules/organizations/delete-organizations';
import NewsletterForm from '~/modules/system/newsletter-form';
import { Button } from '~/modules/ui/button';
import { Input } from '~/modules/ui/input';
import { OrganizationsSearch } from '~/router/routeTree';
import { useUserStore } from '~/store/user';
import { Organization } from '~/types';
import ColumnsView, { ColumnOrColumnGroup } from '../../common/data-table/columns-view';
import CountAndLoading from '../../common/data-table/count-and-loading';
import { dialog } from '../../common/dialoger/state';
import { sheet } from '../../common/sheeter/state';

interface Props {
  total?: number;
  query?: string;
  selectedOrganizations: Organization[];
  setQuery: (value?: string) => void;
  isFiltered?: boolean;
  isLoading?: boolean;
  onResetFilters?: () => void;
  onResetSelectedRows?: () => void;
  callback: (organizations: Organization[], action: 'create' | 'update' | 'delete') => void;
  columns: ColumnOrColumnGroup<Organization>[];
  setColumns: Dispatch<SetStateAction<ColumnOrColumnGroup<Organization>[]>>;
  sort: OrganizationsSearch['sort'];
  order: OrganizationsSearch['order'];
}

function Toolbar({
  total,
  isFiltered,
  query,
  setQuery,
  isLoading,
  callback,
  onResetFilters,
  onResetSelectedRows,
  columns,
  setColumns,
  selectedOrganizations,
  sort,
  order,
}: Props) {
  const { t } = useTranslation();
  const user = useUserStore((state) => state.user);
  const [queryValue, setQueryValue] = useState(query ?? '');

  const onOpenDeleteDialog = () => {
    dialog(
      <DeleteOrganizations
        organizations={selectedOrganizations}
        callback={(organizations) => {
          callback(organizations, 'delete');
          toast.success(t('common:success.delete_organizations'));
        }}
        dialog
      />,
      {
        drawerOnMobile: false,
        className: 'max-w-xl',
        title: t('common:delete'),
        text: t('common:confirm.delete_organizations'),
      },
    );
  };

  useEffect(() => {
    const delayQueryTimeoutId = setTimeout(() => {
      setQuery(queryValue || undefined);
    }, 200);
    return () => clearTimeout(delayQueryTimeoutId);
  }, [queryValue]);

  useEffect(() => {
    setQueryValue(query ?? '');
  }, [query]);

  return (
    <div className="items-center justify-between sm:flex">
      <div className="flex items-center space-x-2">
        {selectedOrganizations.length > 0 ? (
          <>
            <Button
              onClick={() => {
                sheet(<NewsletterForm sheet />, {
                  className: 'sm:max-w-[64rem] z-50',
                  title: t('common:newsletter'),
                  text: t('common:text.newsletter'),
                  id: 'newsletter-form',
                });
              }}
            >
              {t('common:newsletter')}
            </Button>
            <Button variant="destructive" className="relative" onClick={onOpenDeleteDialog}>
              <div className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-black px-1">
                <span className="text-xs font-medium text-white">{selectedOrganizations.length}</span>
              </div>
              {t('common:remove')}
            </Button>
            <Button variant="secondary" onClick={onResetSelectedRows}>
              {t('common:clear')}
            </Button>
          </>
        ) : (
          !isFiltered &&
          user.role === 'ADMIN' && (
            <Button
              onClick={() => {
                dialog(<CreateOrganizationForm callback={(organization) => callback([organization], 'create')} dialog />, {
                  className: 'md:max-w-xl',
                  title: t('common:create_organization'),
                });
              }}
            >
              {t('common:create')}
            </Button>
          )
        )}
        <CountAndLoading
          count={total}
          isLoading={isLoading}
          singular={t('common:singular_organization')}
          plural={t('common:plural_organization')}
          isFiltered={isFiltered}
          onResetFilters={onResetFilters}
        />
      </div>
      <div className="mt-2 flex items-center space-x-2 sm:mt-0">
        <Input
          placeholder={t('common:placeholder.search')}
          value={queryValue}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            setQueryValue(event.target.value);
          }}
          className="h-10 w-[150px] lg:w-[250px]"
        />
        <ColumnsView columns={columns} setColumns={setColumns} />
        <Export
          filename="organizations"
          columns={columns}
          selectedRows={selectedOrganizations}
          fetchRows={async (limit) => {
            const { items } = await getOrganizations({
              limit,
              q: query,
              sort,
              order,
            });
            return items;
          }}
        />
      </div>
    </div>
  );
}

export default Toolbar;
