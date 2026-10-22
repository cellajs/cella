import { CheckIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { DropdownActionItem } from '~/modules/common/dropdowner/dropdown-action-item';
import type { IconComponent } from '~/modules/common/icons/types';
import { cn } from '~/utils/cn';

interface DropdownSelectItemProps {
  /** Passed on to `DropdownActionItem`. */
  isMobile?: boolean;
  selected: boolean;
  onSelect: () => void;
  icon?: IconComponent;
  children: ReactNode;
}

/**
 * A dropdowner menu row carrying single-select state. The trailing check stays mounted while
 * unselected, following the ComboboxItemIndicator convention, so labels stay column-aligned.
 */
export function DropdownSelectItem({ isMobile, selected, onSelect, icon, children }: DropdownSelectItemProps) {
  return (
    <DropdownActionItem isMobile={isMobile} icon={icon} onSelect={onSelect}>
      <span className="min-w-0 grow truncate text-left">{children}</span>
      <CheckIcon className={cn('size-4 shrink-0 text-success', !selected && 'invisible')} />
    </DropdownActionItem>
  );
}
