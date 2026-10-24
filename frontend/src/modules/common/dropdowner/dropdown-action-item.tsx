import type { ReactNode } from 'react';
import { useInDropdownerDrawer } from '~/modules/common/dropdowner/drawer';
import { dropdowner, removeIfCurrent } from '~/modules/common/dropdowner/use-dropdowner';
import type { IconComponent } from '~/modules/common/icons/types';
import { Button } from '~/modules/ui/button';
import { DrawerRowSeparator } from '~/modules/ui/drawer';
import { DropdownMenuItem, DropdownMenuSeparator } from '~/modules/ui/dropdown-menu';
import { cn } from '~/utils/cn';

interface DropdownActionItemProps {
  onSelect?: () => void;
  icon?: IconComponent;
  children: ReactNode;
  variant?: 'default' | 'destructive';
  className?: string;
  /** Close the dropdown after selection (default true); an item that swaps it for another, such as `openPopConfirm`, stays either way. */
  closeOnSelect?: boolean;
  /** Marks the row of a single-select list as the current choice. */
  selected?: boolean;
}

/** A dropdowner action: a menu item in the desktop popup, a row in the mobile drawer. */
export function DropdownActionItem({
  onSelect,
  icon: Icon,
  children,
  variant = 'default',
  className,
  closeOnSelect = true,
  selected,
}: DropdownActionItemProps) {
  const inDrawer = useInDropdownerDrawer();

  if (inDrawer) {
    const select = () => {
      const key = dropdowner.getState().dropdown?.key;
      onSelect?.();
      if (closeOnSelect && key !== undefined) removeIfCurrent(key);
    };

    return (
      <Button
        variant="row"
        data-variant={variant}
        aria-pressed={selected}
        onClick={select}
        className={cn(variant === 'destructive' && 'text-destructive', className)}
      >
        {Icon && <Icon />}
        {children}
      </Button>
    );
  }

  return (
    <DropdownMenuItem variant={variant} closeOnClick={closeOnSelect} onClick={onSelect} className={className}>
      {Icon && <Icon />}
      {children}
    </DropdownMenuItem>
  );
}

/** Parts groups of dropdowner actions that do different kinds of things, in the desktop popup and the mobile drawer alike. */
export function DropdownActionSeparator() {
  const inDrawer = useInDropdownerDrawer();
  return inDrawer ? <DrawerRowSeparator /> : <DropdownMenuSeparator />;
}
