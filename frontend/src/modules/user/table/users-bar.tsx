import { MailIcon, TrashIcon, XSquareIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ColumnsView } from '~/modules/common/data-table/columns-view';
import { TableBarButton } from '~/modules/common/data-table/table-bar-button';
import { TableBarContainer } from '~/modules/common/data-table/table-bar-container';
import { TableCount } from '~/modules/common/data-table/table-count';
import {
  FilterBarActions,
  FilterBarFilters,
  FilterBarSearch,
  TableFilterBar,
} from '~/modules/common/data-table/table-filter-bar';
import { TableSearch } from '~/modules/common/data-table/table-search';
import type { BaseTableBarProps, CallbackArgs } from '~/modules/common/data-table/types';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { FocusView } from '~/modules/common/focus-view';
import { SelectRole } from '~/modules/common/form-fields/select-role';
import { toaster } from '~/modules/common/toaster/toaster';
import { UnsavedBadge } from '~/modules/common/unsaved-badge';
import { DeleteUsers } from '~/modules/user/delete-users';
import { InviteUsers } from '~/modules/user/invite-users';
import type { BaseUser, UsersRouteSearchParams } from '~/modules/user/types';
import { useInfiniteQueryTotal } from '~/query/basic/use-infinite-query-total';

type UsersTableBarProps = BaseTableBarProps<BaseUser, UsersRouteSearchParams>;

export const UsersTableBar = ({
  selected,
  queryKey,
  searchVars,
  setSearch,
  columns,
  setColumns,
  clearSelection,
}: UsersTableBarProps) => {
  const { t } = useTranslation();
  const createDialog = useDialoger((state) => state.create);

  const total = useInfiniteQueryTotal(queryKey);

  const inviteButtonRef = useRef(null);
  const deleteButtonRef = useRef(null);
  const inviteContainerRef = useRef(null);

  const { q, role } = searchVars;

  const isFiltered = role !== undefined || !!q;

  // Drop selected Rows on search
  const onSearch = (searchString: string) => {
    clearSelection();
    setSearch({ q: searchString });
  };
  // Drop selected Rows on role change
  const onRoleChange = (role?: string) => {
    clearSelection();
    setSearch({ role: role === 'all' ? undefined : (role as UsersRouteSearchParams['role']) });
  };

  const onResetFilters = () => {
    setSearch({ q: '', role: undefined });
    clearSelection();
  };

  const openInviteDialog = () => {
    createDialog(<InviteUsers mode={'email'} dialog />, {
      id: 'invite-users',
      triggerRef: inviteButtonRef,
      drawerOnMobile: false,
      className: 'w-auto shadow-none border relative z-60 max-w-4xl',
      container: { ref: inviteContainerRef, overlay: true },
      title: t('c:invite'),
      titleContent: <UnsavedBadge title={t('c:invite')} />,
      description: `${t('c:invite_users.text')}`,
    });
  };

  const openDeleteDialog = () => {
    const callback = (args: CallbackArgs<BaseUser[]>) => {
      if (args.status === 'success') {
        const message =
          args.data.length === 1
            ? t('c:success.delete_resource', { resource: t('c:user') })
            : t('c:success.delete_counted_resources', {
                count: args.data.length,
                resources: t('c:users').toLowerCase(),
              });
        toaster(message, 'success');
      }
      clearSelection();
    };

    createDialog(<DeleteUsers dialog users={selected} callback={callback} />, {
      id: 'delete-users',
      triggerRef: inviteButtonRef,
      className: 'max-w-xl',
      title: t('c:delete'),
      description: t('c:confirm.delete_resource', {
        name: selected.map((u) => u.email).join(', '),
        resource: selected.length > 1 ? t('c:users').toLowerCase() : t('c:user').toLowerCase(),
      }),
    });
  };

  return (
    <>
      <TableBarContainer searchVars={searchVars} offsetTop={48}>
        {/* Table filter bar */}
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
                  label="c:delete"
                />

                <TableBarButton variant="ghost" onClick={clearSelection} icon={XSquareIcon} label="c:clear" />
              </>
            ) : (
              !isFiltered && (
                <TableBarButton
                  ref={inviteButtonRef}
                  icon={MailIcon}
                  label="c:invite"
                  onClick={() => openInviteDialog()}
                />
              )
            )}
            {selected.length === 0 && (
              <TableCount count={total} label="c:user" isFiltered={isFiltered} onResetFilters={onResetFilters} />
            )}
          </FilterBarActions>

          <div className="sm:grow" />

          <FilterBarSearch>
            <TableSearch name="userSearch" value={q} setQuery={onSearch} />
          </FilterBarSearch>
          <FilterBarFilters>
            <SelectRole
              value={role === undefined ? 'all' : role}
              onChange={onRoleChange}
              className="h-10 sm:min-w-32"
            />
          </FilterBarFilters>
        </TableFilterBar>

        {/* Columns view */}
        <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} />

        {/* Focus view */}
        <FocusView iconOnly />
      </TableBarContainer>

      {/* Container for embedded dialog */}
      <div ref={inviteContainerRef} className="empty:hidden" />
    </>
  );
};
