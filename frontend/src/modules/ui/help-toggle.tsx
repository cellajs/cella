import { ChevronUpIcon, CircleQuestionMarkIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

interface HelpToggleProps {
  open: boolean;
  onToggle: () => void;
  className?: string;
}

/** Opens and closes a help text; the question mark and the chevron crossfade in place, so the row never reflows. */
export function HelpToggle({ open, onToggle, className }: HelpToggleProps) {
  const { t } = useTranslation();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={t('c:help')}
      aria-expanded={open}
      onClick={onToggle}
      press={false}
      className={cn('size-6 text-muted-foreground focus-visible:text-foreground', className)}
    >
      <span className="relative size-4">
        <CircleQuestionMarkIcon
          className={cn('absolute inset-0 transition-all duration-200 motion-reduce:transition-none', open && 'rotate-90 opacity-0')}
        />
        <ChevronUpIcon
          className={cn('absolute inset-0 transition-all duration-200 motion-reduce:transition-none', !open && '-rotate-90 opacity-0')}
        />
      </span>
    </Button>
  );
}

interface HelpCollapseProps {
  open: boolean;
  children: ReactNode;
}

/** Reveals a help text under its label; the grid row animates from `0fr` to `1fr`, which `height: auto` cannot. */
export function HelpCollapse({ open, children }: HelpCollapseProps) {
  return (
    <div
      className={cn('grid transition-[grid-template-rows] duration-200 motion-reduce:transition-none', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}
    >
      <div
        className={cn(
          'overflow-hidden text-muted-foreground text-sm transition-opacity duration-200 motion-reduce:transition-none',
          !open && 'opacity-0',
        )}
      >
        {children}
      </div>
    </div>
  );
}
