import { useRef } from 'react';
import { SearchClearButton } from '~/modules/common/search-clear-button';
import { SearchSpinner } from '~/modules/common/search-spinner';
import { ComboboxPrimitive } from '~/modules/ui/combobox';
import { cn } from '~/utils/cn';

interface ComboboxSearchInputProps extends Omit<ComboboxPrimitive.Input.Props, 'value'> {
  value: string;
  wrapClassName?: string;
  isSearching?: boolean;
  spinnerDelay?: number;
  /** Empties the search text; without it the field shows no clear X. */
  onClear?: () => void;
}

/** Search-styled combobox input for the command palette and dropdowner. */
export function ComboboxSearchInput({
  className,
  wrapClassName,
  isSearching = false,
  spinnerDelay,
  onClear,
  value,
  ref,
  ...props
}: ComboboxSearchInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const showClear = !!onClear && value.length > 0;

  return (
    <div
      data-slot="combobox-search-input-wrapper"
      className={cn('group/search-input relative flex h-10 items-center border-b px-3', showClear && 'pr-10', wrapClassName)}
    >
      <SearchSpinner isSearching={isSearching} value={value} appearDelay={spinnerDelay} />
      <ComboboxPrimitive.Input
        data-slot="combobox-search-input"
        className={cn(
          // text-md is at least 16px on phones: iOS zooms into a focused field below that.
          'flex h-10 w-full rounded-md bg-transparent py-3 text-md outline-hidden placeholder:text-faint-foreground disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm [&::-webkit-search-cancel-button]:hidden',
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
          inputRef.current = element;
          if (typeof ref === 'function') ref(element);
          else if (ref) ref.current = element;
        }}
      />
      {/* Combobox.Clear shows only for a selected item, and in multiple mode it also empties the selection */}
      {showClear && (
        <SearchClearButton
          className="absolute top-1/2 right-2 -translate-y-1/2"
          onClick={() => {
            onClear();
            inputRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}
