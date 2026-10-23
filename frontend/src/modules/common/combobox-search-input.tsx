import { SearchClearButton } from '~/modules/common/search-clear-button';
import { SearchSpinner } from '~/modules/common/search-spinner';
import { ComboboxPrimitive } from '~/modules/ui/combobox';
import { cn } from '~/utils/cn';

interface ComboboxSearchInputProps extends Omit<ComboboxPrimitive.Input.Props, 'value'> {
  value: string;
  wrapClassName?: string;
  isSearching?: boolean;
  spinnerDelay?: number;
  showClear?: boolean;
}

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
}: ComboboxSearchInputProps) {
  return (
    <div
      data-slot="combobox-search-input-wrapper"
      className={cn('group/search-input relative flex h-10 items-center border-b px-3', showClear && value.length > 0 && 'pr-10', wrapClassName)}
    >
      <SearchSpinner isSearching={isSearching} value={value} appearDelay={spinnerDelay} />
      <ComboboxPrimitive.Input
        data-slot="combobox-search-input"
        className={cn(
          // text-md is at least 16px on phones: iOS zooms into a focused field below that.
          'flex h-10 w-full rounded-md bg-transparent py-3 text-md outline-hidden placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm [&::-webkit-search-cancel-button]:hidden',
          className,
        )}
        value={value}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        data-1p-ignore
        data-lpignore="true"
        {...props}
        ref={(element) => {
          // type="search" is set imperatively (base-ui omits it from its types) so password managers skip the input.
          if (element) element.type = 'search';
          if (typeof ref === 'function') ref(element);
          else if (ref) ref.current = element;
        }}
      />
      {showClear && value.length > 0 && (
        <ComboboxPrimitive.Clear render={<SearchClearButton className="absolute top-1/2 right-2 -translate-y-1/2" />} />
      )}
    </div>
  );
}
