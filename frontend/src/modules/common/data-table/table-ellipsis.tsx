import type { LucideIcon } from 'lucide-react';
import { EllipsisVerticalIcon } from 'lucide-react';
import { type RefObject, useRef } from 'react';
import { DropdownActionItem } from '~/modules/common/dropdowner/dropdown-action-item';
import { useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { Button } from '~/modules/ui/button';

export type EllipsisOption<T> = {
  label: string;
  icon: LucideIcon;
  onSelect: (row: T, triggerRef: RefObject<HTMLButtonElement | null>) => void;
};

interface Props<T> {
  row: T;
  tabIndex: number;
  options: EllipsisOption<T>[];
}

/**
 * Renders an ellipsis button in a table cell that opens a dropdown - drawer on mobile - with given options.
 */
export function TableEllipsis<T extends { id: string }>({ row, tabIndex, options }: Props<T>) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const openDropdown = () => {
    if (!triggerRef.current) return;

    const { create } = useDropdowner.getState();
    const isMobile = window.innerWidth < 640;

    create(
      <div role="menu" className="flex-col flex gap-2 p-1">
        {options.map(({ label, icon: Icon, onSelect }) => (
          <DropdownActionItem key={label} isMobile={isMobile} icon={Icon} onSelect={() => onSelect(row, triggerRef)}>
            {label}
          </DropdownActionItem>
        ))}
      </div>,
      {
        id: 'row-dropdown',
        triggerId: `ellipsis-${row.id}`,
        triggerRef,
        align: 'end',
      },
    );
  };

  return (
    <Button
      ref={triggerRef}
      variant="cell"
      size="cell"
      tabIndex={tabIndex}
      className="justify-center data-dropdowner-active:bg-accent/50"
      onClick={openDropdown}
    >
      <EllipsisVerticalIcon size={16} />
    </Button>
  );
}
