import { EllipsisVerticalIcon } from 'lucide-react';
import { Fragment, type ReactNode, type RefObject, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { DropdownActionItem, DropdownActionSeparator } from '~/modules/common/dropdowner/dropdown-action-item';
import { DropdownerTriggerIcon } from '~/modules/common/dropdowner/trigger-icon';
import { dropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import type { IconComponent } from '~/modules/common/icons/types';
import { Button } from '~/modules/ui/button';

export type EllipsisOption<T> = {
  label: string;
  icon: IconComponent;
  variant?: 'default' | 'destructive';
} & (
  | { onSelect: (row: T, triggerRef: RefObject<HTMLButtonElement | null>) => void }
  /** Asks first: the menu turns into this confirmation, whose Cancel steps back to the menu. */
  | { confirm: (row: T) => { title: ReactNode; content: ReactNode } }
);

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
      options.map((option, index) => (
        <Fragment key={option.label}>
          {option.variant === 'destructive' && index > 0 && options[index - 1].variant !== 'destructive' && <DropdownActionSeparator />}
          <DropdownActionItem
            icon={option.icon}
            variant={option.variant}
            confirm={'confirm' in option ? option.confirm(row) : undefined}
            onSelect={'onSelect' in option ? () => option.onSelect(row, triggerRef) : undefined}
          >
            {option.label}
          </DropdownActionItem>
        </Fragment>
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
      className="justify-center data-dropdowner-active:opacity-100"
      aria-label={t('c:actions')}
      onClick={openDropdown}
    >
      <DropdownerTriggerIcon icon={EllipsisVerticalIcon} />
    </Button>
  );
}
