import { EllipsisVertical, Trash } from 'lucide-react';
import { type RefObject, useRef } from 'react';
import { i18n } from '~/lib/i18n';
import { useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { Button } from '~/modules/ui/button';
import { DropdownMenuItem } from '~/modules/ui/dropdown-menu';
import DeleteUsers from '~/modules/users/delete-users';
import type { User } from '~/modules/users/types';
import { PopConfirm } from '../popconfirm';
import type { CallbackArgs } from './types';

interface Props {
  row: User;
  tabIndex: number;
}

const openDropdown = (row: User, triggerRef: RefObject<HTMLButtonElement | null>) => {
  if (!triggerRef.current) return; // handle null here safely

  const { create } = useDropdowner.getState();

  const RowDropdown = () => {
    const { update } = useDropdowner.getState();

    // Only on cancel we need to remove manually
    const callback = ({ status }: CallbackArgs<User[]>) => {
      if (status === 'settle') update({ content: <RowDropdown /> });
    };
    return (
      <div className="p-1">
        <DropdownMenuItem
          className="flex items-center"
          onClick={() =>
            update({
              content: (
                <PopConfirm title={i18n.t('common:delete_confirm.text', { name: row.name })}>
                  <DeleteUsers users={[row]} callback={callback} />
                </PopConfirm>
              ),
            })
          }
        >
          <Trash size={16} />
          <span className="ml-2 font-light">{i18n.t('common:delete')}</span>
        </DropdownMenuItem>
      </div>
    );
  };

  create(<RowDropdown />, {
    id: 'row-dropdown',
    triggerId: `ellipsis-${row.id}`,
    triggerRef: triggerRef,
    align: 'end',
  });
};

const TableEllipsis = ({ row, tabIndex }: Props) => {
  const triggerRef = useRef(null);

  return (
    <Button
      ref={triggerRef}
      id={`ellipsis-${row.id}`}
      variant="cell"
      size="icon"
      tabIndex={tabIndex}
      className="h-full w-full"
      onClick={() => openDropdown(row, triggerRef)}
    >
      <EllipsisVertical size={16} />
    </Button>
  );
};

export default TableEllipsis;
