import { XIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '~/utils/cn';

/** Plain X that clears a search field, round hover target as in Material search bars. */
export function SearchClearButton({ className, ...props }: ComponentProps<'button'>) {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      aria-label={t('c:clear_search')}
      className={cn(
        'focus-effect flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
        className,
      )}
      // Keeps focus in the input, so typing can continue right after clearing
      onMouseDown={(event) => event.preventDefault()}
      {...props}
    >
      <XIcon className="size-4" />
    </button>
  );
}
