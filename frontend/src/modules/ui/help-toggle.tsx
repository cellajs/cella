import { ChevronUpIcon, CircleQuestionMarkIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

interface HelpToggleProps {
  open: boolean;
  onToggle: () => void;
  className?: string;
}

/**
 * Opens and closes a help text. The question mark and the chevron are stacked and crossfade, so the button keeps
 * its size and the row it sits in never reflows.
 */
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
      className={cn('size-6 opacity-50 hover:opacity-100', className)}
    >
      <span className="relative size-4">
        <CircleQuestionMarkIcon
          className={cn(
            'absolute inset-0 transition-all duration-200 motion-reduce:transition-none',
            open ? 'rotate-90 opacity-0' : 'rotate-0 opacity-100',
          )}
        />
        <ChevronUpIcon
          className={cn(
            'absolute inset-0 transition-all duration-200 motion-reduce:transition-none',
            open ? 'rotate-0 opacity-100' : '-rotate-90 opacity-0',
          )}
        />
      </span>
    </Button>
  );
}

interface HelpCollapseProps {
  open: boolean;
  children: React.ReactNode;
}

/**
 * Reveals a help text under the label it belongs to. The grid row animates from `0fr` to `1fr`, which gets the
 * smooth open that `height: auto` cannot, and the text fades in step with it.
 */
export function HelpCollapse({ open, children }: HelpCollapseProps) {
  return (
    <div
      className={cn('grid transition-[grid-template-rows] duration-200 motion-reduce:transition-none', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}
    >
      <div
        className={cn(
          'overflow-hidden text-muted-foreground text-sm transition-opacity duration-200 motion-reduce:transition-none',
          open ? 'opacity-100' : 'opacity-0',
        )}
      >
        {children}
      </div>
    </div>
  );
}
