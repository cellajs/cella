import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button, ButtonProps } from '~/modules/ui/button';
import { DropdownMenuItem } from '~/modules/ui/dropdown-menu';

interface Props {
  isMobile: boolean;
  onSelect?: () => void;
  icon?: LucideIcon;
  children: ReactNode;
  variant?: ButtonProps['variant'];
  className?: ButtonProps['className'];
}

/**
 * Renders a dropdown action as a button or menu item based on viewport.
 */
export function DropdownActionItem({
  isMobile,
  onSelect,
  icon: Icon,
  children,
  variant = 'secondary',
  className,
}: Props) {
  const sharedProps = {
    onClick: onSelect,
    onSelect,
    className: `flex items-center w-full ${className ?? ''}`,
  };

  if (isMobile) {
    return (
      <div className="sm:p-1">
        <Button {...sharedProps} variant={variant}>
          {Icon && <Icon size={16} className="mr-2" />}
          {children}
        </Button>
      </div>
    );
  }

  return (
    <DropdownMenuItem {...sharedProps}>
      {Icon && <Icon size={16} />}
      <span className="ml-2 font-light">{children}</span>
    </DropdownMenuItem>
  );
}
