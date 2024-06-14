import { Mail, Trash, XSquare } from 'lucide-react';
import { useContext, useRef, type Dispatch, type SetStateAction } from 'react';
import { FilterBarActions, FilterBarContent, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import TableSearch from '~/modules/common/data-table/table-search';
import { FocusView } from '~/modules/common/focus-view';
import SelectRole from '~/modules/common/form-fields/select-role';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import type { ContextEntityType, Member } from '~/types';
import ColumnsView, { type ColumnOrColumnGroup } from '../../common/data-table/columns-view';
import TableCount from '../../common/data-table/table-count';
import { Trans, useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { dialog } from '~/modules/common/dialoger/state';
import InviteUsers from '~/modules/users/invite-users';
import RemoveMembersForm from '~/modules/organizations/members-table/remove-member-form';
import { motion } from 'framer-motion';
import Export from '~/modules/common/data-table/export';
import type { MembersRoles } from '.';
import { EntityContext } from '~/modules/common/entity-context';

interface Props {
  entityType: ContextEntityType;
  total?: number;
  query?: string;
  idOrSlug: string;
  setQuery: (value?: string) => void;
  isFiltered?: boolean;
  isAdmin: boolean;
  role?: MembersRoles;
  onRoleChange: (role?: string) => void;
  selectedMembers: Member[];
  onResetFilters: () => void;
  onResetSelectedRows?: () => void;
  columns: ColumnOrColumnGroup<Member>[];
  setColumns: Dispatch<SetStateAction<ColumnOrColumnGroup<Member>[]>>;
  callback: (items: Member[], action: 'create' | 'update' | 'delete') => void;
  fetchForExport: (limit: number) => Promise<Member[]>;
}

function Toolbar({
  entityType,
  selectedMembers,
  isFiltered,
  total,
  role,
  onRoleChange,
  onResetFilters,
  onResetSelectedRows,
  query,
  setQuery,
  isAdmin,
  columns,
  setColumns,
  idOrSlug,
  callback,
  fetchForExport,
}: Props) {
  const { t } = useTranslation();
  const containerRef = useRef(null);
  const { entity } = useContext(EntityContext);

  const openInviteDialog = () => {
    dialog(<InviteUsers entity={entity} mode={null} dialog />, {
      id: 'user-invite',
      drawerOnMobile: false,
      className: 'w-auto shadow-none relative z-[120] max-w-4xl',
      container: containerRef.current,
      title: t('common:invite'),
      text: `${t('common:invite_users.text')}`,
    });
  };

  const openRemoveDialog = () => {
    dialog(
      <RemoveMembersForm
        entityId={idOrSlug}
        entityType={entityType}
        dialog
        callback={(members) => {
          callback(members, 'delete');
          toast.success(t('common:success.delete_members'));
        }}
        members={selectedMembers}
      />,
      {
        drawerOnMobile: false,
        className: 'max-w-xl',
        title: t('common:remove_member'),
        text: (
          <Trans
            i18nKey="common:confirm.remove_members"
            values={{
              emails: selectedMembers.map((member) => member.email).join(', '),
            }}
          />
        ),
      },
    );
  };

  return (
    <>
      <div className={'flex items-center max-sm:justify-between md:gap-2'}>
        <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
          <FilterBarActions>
            {selectedMembers.length > 0 ? (
              <>
                <Button asChild variant="destructive" onClick={openRemoveDialog} className="relative">
                  <motion.button layout="size" layoutRoot transition={{ duration: 0.1 }} layoutId="members-filter-bar-button">
                    <Badge className="py-0 px-1 absolute -right-2 min-w-5 flex justify-center -top-2 animate-in zoom-in">
                      {selectedMembers.length}
                    </Badge>
                    <motion.span layoutId="members-filter-bar-icon">
                      <Trash size={16} />
                    </motion.span>

                    <span className="ml-1 max-xs:hidden">{idOrSlug ? t('common:remove') : t('common:delete')}</span>
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
              !isFiltered &&
              isAdmin && (
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
            {selectedMembers.length === 0 && <TableCount count={total} type="member" isFiltered={isFiltered} onResetFilters={onResetFilters} />}
          </FilterBarActions>

          <div className="sm:grow" />

          <FilterBarContent className="max-sm:animate-in max-sm:slide-in-from-top max-sm:fade-in max-sm:duration-300">
            <TableSearch value={query} setQuery={setQuery} />
            <SelectRole entityType={entityType} value={role === undefined ? 'all' : role} onChange={onRoleChange} className="h-10 sm:min-w-32" />
          </FilterBarContent>
        </TableFilterBar>

        <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} />

        {fetchForExport && (
          <Export<Member>
            className="max-lg:hidden"
            filename={`${entityType} members`}
            columns={columns}
            selectedRows={selectedMembers}
            fetchRows={fetchForExport}
          />
        )}

        <FocusView iconOnly />
      </div>
      <div ref={containerRef} />
    </>
  );
}

export default Toolbar;
