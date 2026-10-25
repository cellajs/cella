import { XIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '~/utils/cn';
import { tw } from '~/utils/tw';

const searchButtonClass = tw(
  'focus-effect flex shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-muted hover:text-foreground',
);

/** Plain X that clears a search field, round hover target as in Material search bars. */
export function SearchClearButton({ className, ...props }: ComponentProps<'button'>) {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      aria-label={t('c:clear_search')}
      className={cn(searchButtonClass, 'size-7 text-muted-foreground', className)}
      // Keeps focus in the input, so typing can continue right after clearing
      onMouseDown={(event) => event.preventDefault()}
      {...props}
    >
      <XIcon className="size-4" />
    </button>
  );
}

/** Plain X beside a search field that ends the search; larger than the clear X inside the field and in full text color. */
export function SearchCloseButton({ className, ...props }: ComponentProps<'button'>) {
  const { t } = useTranslation();

  return (
    <button type="button" aria-label={t('c:close')} className={cn(searchButtonClass, 'size-9', className)} {...props}>
      <XIcon className="size-5" />
    </button>
  );
}
