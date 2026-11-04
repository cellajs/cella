import { LoaderCircleIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useInDropdownerDrawer } from '~/modules/common/dropdowner/drawer';
import { dropdowner, removeIfCurrent } from '~/modules/common/dropdowner/use-dropdowner';
import type { IconComponent } from '~/modules/common/icons/types';
import { openPopConfirm } from '~/modules/common/popconfirm';
import { Button } from '~/modules/ui/button';
import { DrawerRowSeparator } from '~/modules/ui/drawer';
import { DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '~/modules/ui/dropdown-menu';
import { cn } from '~/utils/cn';

interface DropdownActionItemProps {
  onSelect?: () => void;
  icon?: IconComponent;
  children: ReactNode;
  variant?: 'default' | 'destructive';
  className?: string;
  /** An item that swaps the dropdown for another, such as `openPopConfirm`, stays either way. */
  closeOnSelect?: boolean;
  /** The current choice of a single-select list. */
  selected?: boolean;
  /** Selecting turns the menu into this confirmation, whose Cancel steps back. */
  confirm?: { title: ReactNode; content: ReactNode };
  loading?: boolean;
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

/** Names a group of dropdowner rows, in the desktop popup and the mobile drawer alike. */
export function DropdownActionGroup({ label, children }: { label: string; children: ReactNode }) {
  const inDrawer = useInDropdownerDrawer();

  if (inDrawer) {
    return (
      <div className="flex flex-col">
        {/* Lines up with the rows' text */}
        <p className="group-label px-4.5 pt-2 pb-1 text-xs">{label}</p>
        {children}
      </div>
    );
  }

  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel>{label}</DropdownMenuLabel>
      {children}
    </DropdownMenuGroup>
  );
}

/** Parts groups of dropdowner actions that do different kinds of things, in the desktop popup and the mobile drawer alike. */
export function DropdownActionSeparator() {
  const inDrawer = useInDropdownerDrawer();
  return inDrawer ? <DrawerRowSeparator /> : <DropdownMenuSeparator />;
}
