import { EllipsisVerticalIcon } from 'lucide-react';
import { type RefObject, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { DropdownActionItem } from '~/modules/common/dropdowner/dropdown-action-item';
import { DropdownerTriggerIcon } from '~/modules/common/dropdowner/trigger-icon';
import { dropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import type { IconComponent } from '~/modules/common/icons/types';
import { Button } from '~/modules/ui/button';

export type EllipsisOption<T> = {
  label: string;
  icon: IconComponent;
  onSelect: (row: T, triggerRef: RefObject<HTMLButtonElement | null>) => void;
};

interface TableEllipsisProps<T> {
  row: T;
  tabIndex: number;
  options: EllipsisOption<T>[];
}

/** Ellipsis cell button opening a dropdown, or a drawer on mobile. */
export function TableEllipsis<T extends { id: string }>({ row, tabIndex, options }: TableEllipsisProps<T>) {
  const { t } = useTranslation();
  const triggerRef = useRef<HTMLButtonElement>(null);

  const openDropdown = () => {
    if (!triggerRef.current) return;

    dropdowner.getState().create(
      options.map(({ label, icon: Icon, onSelect }) => (
        <DropdownActionItem key={label} icon={Icon} onSelect={() => onSelect(row, triggerRef)}>
          {label}
        </DropdownActionItem>
      )),
      { id: 'row-dropdown', triggerId: `ellipsis-${row.id}`, triggerRef, align: 'end', kind: 'menu' },
    );
  };

  return (
    <Button
      ref={triggerRef}
      variant="cell"
      size="cell"
      tabIndex={tabIndex}
      className="justify-center data-dropdowner-active:bg-accent/50 data-dropdowner-active:opacity-100"
      aria-label={t('c:actions')}
      onClick={openDropdown}
    >
      <DropdownerTriggerIcon icon={EllipsisVerticalIcon} />
    </Button>
  );
}
