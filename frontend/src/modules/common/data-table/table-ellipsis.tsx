import { EllipsisVertical, Trash } from 'lucide-react';
import { type RefObject, useRef } from 'react';
import { i18n } from '~/lib/i18n';
import type { CallbackArgs } from '~/modules/common/data-table/types';
import { DropdownActionItem } from '~/modules/common/dropdowner/dropdown-action-item';
import { useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { PopConfirm } from '~/modules/common/popconfirm';
import { Button } from '~/modules/ui/button';
import DeleteUsers from '~/modules/users/delete-users';
import type { User } from '~/modules/users/types';

interface Props {
  row: User;
  tabIndex: number;
}

const openDropdown = (row: User, triggerRef: RefObject<HTMLButtonElement | null>) => {
  if (!triggerRef.current) return; // handle null here safely

  const { create } = useDropdowner.getState();

  const RowDropdown = () => {
    const { update, remove } = useDropdowner.getState();
    const isMobile = window.innerWidth < 640;

    // Only on cancel we need to remove manually
    const callback = ({ status }: CallbackArgs<User[]>) => {
      // Use update if there are more options in the dropdown
      // if (status === 'settle') update({ content: <RowDropdown /> });
      if (status === 'settle') remove();
    };

    const handleClick = () => {
      update({
        content: (
          <PopConfirm title={i18n.t('common:delete_confirm.text', { name: row.name })}>
            <DeleteUsers users={[row]} callback={callback} />
          </PopConfirm>
        ),
      });
    };

    // Use Button on isMobile, else DropdownMenuItem
    return (
      <DropdownActionItem isMobile={isMobile} onSelect={handleClick} icon={Trash}>
        {i18n.t('common:delete')}
      </DropdownActionItem>
    );
  };

  create(
    <div className="p-1">
      <RowDropdown />
    </div>,
    {
      id: 'row-dropdown',
      triggerId: `ellipsis-${row.id}`,
      triggerRef: triggerRef,
      align: 'end',
    },
  );
};

const TableEllipsis = ({ row, tabIndex }: Props) => {
  const triggerRef = useRef(null);

  return (
    <Button ref={triggerRef} variant="cell" size="icon" tabIndex={tabIndex} className="h-full w-full" onClick={() => openDropdown(row, triggerRef)}>
      <EllipsisVertical size={16} />
    </Button>
  );
};

export default TableEllipsis;
