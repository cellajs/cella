import { CheckIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useInDropdownerDrawer } from '~/modules/common/dropdowner/drawer';
import type { IconComponent } from '~/modules/common/icons/types';
import { Button } from '~/modules/ui/button';
import { DropdownMenuCheckboxItem } from '~/modules/ui/dropdown-menu';
import { cn } from '~/utils/cn';

interface DropdownToggleItemProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  icon?: IconComponent;
  children: ReactNode;
}

/** A dropdowner row that turns one setting on or off and keeps its menu open: a checkbox item in the popup, a pressed row in the drawer. */
export function DropdownToggleItem({ checked, onCheckedChange, icon: Icon, children }: DropdownToggleItemProps) {
  const inDrawer = useInDropdownerDrawer();

  if (inDrawer) {
    return (
      <Button variant="row" aria-pressed={checked} onClick={() => onCheckedChange(!checked)}>
        {Icon && <Icon />}
        <span className="min-w-0 grow truncate text-left">{children}</span>
        <CheckIcon className={cn('size-4 shrink-0 text-success', !checked && 'invisible')} />
      </Button>
    );
  }

  return (
    <DropdownMenuCheckboxItem checked={checked} onCheckedChange={onCheckedChange}>
      {Icon && <Icon />}
      {children}
    </DropdownMenuCheckboxItem>
  );
}
