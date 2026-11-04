import { XIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '~/utils/cn';
import { tw } from '~/utils/tw';

const searchButtonClass = tw(
  'focus-effect hover:bg-hover hover:text-foreground flex shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors',
);

/** Plain X that clears a search field, round hover target as in Material search bars. */
export function SearchClearButton({ className, ...props }: ComponentProps<'button'>) {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      aria-label={t('c:clear_search')}
      // A 44px tap target on touch, the X itself unchanged
      className={cn(
        searchButtonClass,
        'text-muted-foreground relative size-7 pointer-coarse:after:absolute pointer-coarse:after:-inset-2',
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

interface SearchRecentRemoveButtonProps {
  onRemove: () => void;
  className?: string;
}

/** The X of a recent search, inside a `group/recent` row: it shows with the row's hover, and always where there is no hover. */
export function SearchRecentRemoveButton({ onRemove, className }: SearchRecentRemoveButtonProps) {
  const { t } = useTranslation();

  return (
    <SearchClearButton
      aria-label={t('c:remove')}
      className={cn(
        'hover:bg-hover active:bg-hover size-6 rounded-sm opacity-0 group-hover/recent:opacity-100 focus-visible:opacity-100 max-sm:opacity-100 pointer-coarse:opacity-100',
        className,
      )}
      onClick={(event) => {
        event.stopPropagation();
        onRemove();
      }}
    />
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
