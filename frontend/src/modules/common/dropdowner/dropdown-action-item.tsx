import { LoaderCircleIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useInDropdownerDrawer } from '~/modules/common/dropdowner/drawer';
import { dropdowner, removeIfCurrent } from '~/modules/common/dropdowner/use-dropdowner';
import type { IconComponent } from '~/modules/common/icons/types';
import { openPopConfirm } from '~/modules/common/popconfirm';
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
  /** Asks first: selecting turns the menu into this confirmation, whose Cancel steps back to the menu. */
  confirm?: { title: ReactNode; content: ReactNode };
  /** Shows a spinner in place of the icon and ignores presses, e.g. while a confirmed delete runs. */
  loading?: boolean;
  /** Takes focus when its menu or confirmation opens. */
  initialFocus?: boolean;
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
  confirm,
  loading,
  initialFocus,
}: DropdownActionItemProps) {
  const inDrawer = useInDropdownerDrawer();

  const handleSelect = confirm ? () => openPopConfirm(confirm.title, confirm.content) : onSelect;
  const closes = closeOnSelect && !confirm;
  const icon = loading ? <LoaderCircleIcon className="animate-spin" /> : Icon && <Icon />;

  if (inDrawer) {
    const select = () => {
      const key = dropdowner.getState().dropdown?.key;
      handleSelect?.();
      if (closes && key !== undefined) removeIfCurrent(key);
    };

    return (
      <Button
        variant="row"
        data-variant={variant}
        data-autofocus={initialFocus || undefined}
        aria-pressed={selected}
        aria-busy={loading || undefined}
        disabled={loading}
        onClick={select}
        className={cn(variant === 'destructive' && 'text-destructive', className)}
      >
        {icon}
        {children}
      </Button>
    );
  }

  return (
    <DropdownMenuItem
      variant={variant}
      closeOnClick={closes}
      disabled={loading}
      data-autofocus={initialFocus || undefined}
      onClick={handleSelect}
      className={className}
    >
      {icon}
      {children}
    </DropdownMenuItem>
  );
}

/** Parts groups of dropdowner actions that do different kinds of things, in the desktop popup and the mobile drawer alike. */
export function DropdownActionSeparator() {
  const inDrawer = useInDropdownerDrawer();
  return inDrawer ? <DrawerRowSeparator /> : <DropdownMenuSeparator />;
}
