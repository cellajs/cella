import { motion } from 'framer-motion';
import { Mail, Trash, XSquare } from 'lucide-react';
import { type Dispatch, type SetStateAction, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import ColumnsView, { type ColumnOrColumnGroup } from '~/modules/common/data-table/columns-view';
import { FilterBarActions, FilterBarContent, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import TableSearch from '~/modules/common/data-table/table-search';
import { dialog } from '~/modules/common/dialoger/state';
import { FocusView } from '~/modules/common/focus-view';
import SelectRole from '~/modules/common/form-fields/select-role';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import InviteUsers from '~/modules/users/invite-users';
import type { User } from '~/types';
import type { SystemRoles } from '.';
import TableCount from '../../common/data-table/table-count';
import DeleteUsers from '../delete-users';

interface Props {
  total?: number;
  query?: string;
  setQuery: (value?: string) => void;
  isFiltered?: boolean;
  role?: SystemRoles;
  onRoleChange: (role?: string) => void;
  selectedUsers: User[];
  onResetFilters: () => void;
  onResetSelectedRows?: () => void;
  columns: ColumnOrColumnGroup<User>[];
  setColumns: Dispatch<SetStateAction<ColumnOrColumnGroup<User>[]>>;
  callback: (items: User[], action: 'create' | 'update' | 'delete') => void;
}

function Toolbar({
  selectedUsers,
  isFiltered,
  total,
  role,
  onRoleChange,
  onResetFilters,
  onResetSelectedRows,
  query,
  setQuery,
  columns,
  setColumns,
  callback,
}: Props) {
  const { t } = useTranslation();
  const containerRef = useRef(null);

  const openInviteDialog = () => {
    dialog(<InviteUsers mode={'email'} dialog />, {
      id: 'user-invite',
      drawerOnMobile: false,
      className: 'w-auto shadow-none relative z-[120] max-w-4xl',
      container: containerRef.current,
      title: t('common:invite'),
      text: `${t('common:invite_users.text')}`,
    });
  };

  const openDeleteDialog = () => {
    dialog(
      <DeleteUsers
        dialog
        users={selectedUsers}
        callback={(users) => {
          callback(users, 'delete');
          toast.success(t('success.delete_resources', { resources: t('common:users') }));
        }}
      />,
      {
        drawerOnMobile: false,
        className: 'max-w-xl',
        title: t('common:delete'),
        text: t('common:confirm.delete_resource', {
          name: selectedUsers.map((u) => u.email).join(', '),
          resource: selectedUsers.length > 1 ? t('common:users').toLowerCase() : t('common:user').toLowerCase(),
        }),
      },
    );
  };
  return (
    <>
      <div className={'flex items-center max-sm:justify-between md:gap-2'}>
        <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
          <FilterBarActions>
            {selectedUsers.length > 0 ? (
              <>
                <Button asChild variant="destructive" onClick={openDeleteDialog} className="relative">
                  <motion.button layout="size" layoutRoot transition={{ duration: 0.1 }} layoutId="members-filter-bar-button">
                    <Badge className="py-0 px-1 absolute -right-2 min-w-5 flex justify-center -top-2 animate-in zoom-in">
                      {selectedUsers.length}
                    </Badge>
                    <motion.span layoutId="members-filter-bar-icon">
                      <Trash size={16} />
                    </motion.span>
                    <span className="ml-1 max-xs:hidden">{t('common:delete')}</span>
                  </motion.button>
                </Button>

                <Button asChild variant="ghost" onClick={onResetSelectedRows}>
                  <motion.button
                    transition={{
                      bounce: 0,
                      duration: 0.2,
                    }}
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: -20, opacity: 0 }}
                  >
                    <XSquare size={16} />
                    <span className="ml-1">{t('common:clear')}</span>{' '}
                  </motion.button>
                </Button>
              </>
            ) : (
              !isFiltered && (
                <Button asChild onClick={openInviteDialog}>
                  <motion.button transition={{ duration: 0.1 }} layoutId="members-filter-bar-button">
                    <motion.span layoutId="members-filter-bar-icon">
                      <Mail size={16} />
                    </motion.span>
                    <span className="ml-1">{t('common:invite')}</span>
                  </motion.button>
                </Button>
              )
            )}
            {selectedUsers.length === 0 && <TableCount count={total} type="member" isFiltered={isFiltered} onResetFilters={onResetFilters} />}
          </FilterBarActions>

          <div className="sm:grow" />

          <FilterBarContent className="max-sm:animate-in max-sm:slide-in-from-top max-sm:fade-in max-sm:duration-300">
            <TableSearch value={query} setQuery={setQuery} />
            <SelectRole value={role === undefined ? 'all' : role} onChange={onRoleChange} className="h-10 sm:min-w-32" />
          </FilterBarContent>
        </TableFilterBar>

        <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} />
        <FocusView iconOnly />
      </div>

      <div ref={containerRef} />
    </>
  );
}

export default Toolbar;
