import { CircleXIcon } from 'lucide-react';
import { SearchSpinner } from '~/modules/common/search-spinner';
import { ComboboxPrimitive } from '~/modules/ui/combobox';
import { cn } from '~/utils/cn';

/** Search-styled combobox input for the command palette and dropdowner. */
export function ComboboxSearchInput({
  className,
  wrapClassName,
  isSearching = false,
  spinnerDelay,
  showClear = true,
  value,
  ref,
  ...props
}: Omit<ComboboxPrimitive.Input.Props, 'value'> & {
  value: string;
  wrapClassName?: string;
  isSearching?: boolean;
  spinnerDelay?: number;
  showClear?: boolean;
}) {
  return (
    <div
      data-slot="combobox-search-input-wrapper"
      className={cn('group relative flex h-10 items-center border-b px-3', wrapClassName, value.length > 0 && 'pr-10')}
    >
      <SearchSpinner isSearching={isSearching} value={value} appearDelay={spinnerDelay} />
      <ComboboxPrimitive.Input
        data-slot="combobox-search-input"
        className={cn(
          'flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-hidden placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 [&::-webkit-search-cancel-button]:hidden',
          className,
        )}
        value={value}
        data-1p-ignore
        data-lpignore="true"
        {...props}
        ref={(el) => {
          // type="search" is set imperatively (base-ui omits it from its types) so password managers skip the input.
          if (el) el.type = 'search';
          if (typeof ref === 'function') ref(el);
          else if (ref) ref.current = el;
        }}
      />
      {showClear && value.length > 0 && (
        <ComboboxPrimitive.Clear
          render={
            <button
              type="button"
              aria-label="Clear search"
              className="absolute top-1/2 right-3 -translate-y-1/2 cursor-pointer opacity-70 hover:opacity-100"
            />
          }
        >
          <CircleXIcon />
        </ComboboxPrimitive.Clear>
      )}
    </div>
  );
}
