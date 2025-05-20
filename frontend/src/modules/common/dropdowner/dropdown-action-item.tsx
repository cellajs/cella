import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '~/modules/ui/button';
import { DropdownMenuItem } from '~/modules/ui/dropdown-menu';

interface Props {
  isMobile: boolean;
  onSelect?: () => void;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
}

export function DropdownActionItem({ isMobile, onSelect, icon: Icon, children, className }: Props) {
  const sharedProps = {
    onClick: onSelect,
    onSelect,
    className: `flex items-center w-full ${className ?? ''}`,
  };

  if (isMobile) {
    return (
      <div className="sm:p-1">
        <Button {...sharedProps} variant="secondary">
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
