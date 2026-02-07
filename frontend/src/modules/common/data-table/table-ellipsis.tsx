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

export function TableEllipsis<T extends { id: string }>({ row, tabIndex, options }: Props<T>) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const openDropdown = () => {
    if (!triggerRef.current) return;

    const { create } = useDropdowner.getState();
    const isMobile = window.innerWidth < 640;

    const DropdownContent = () => (
      <>
        {options.map(({ label, icon: Icon, onSelect }) => (
          <DropdownActionItem key={label} isMobile={isMobile} icon={Icon} onSelect={() => onSelect(row, triggerRef)}>
            {label}
          </DropdownActionItem>
        ))}
      </>
    );

    create(
      <div className="p-1 flex-col flex gap-2">
        <DropdownContent />
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
      size="icon"
      tabIndex={tabIndex}
      className="h-full w-full"
      onClick={openDropdown}
    >
      <EllipsisVerticalIcon size={16} />
    </Button>
  );
}
