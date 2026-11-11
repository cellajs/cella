import { SearchSpinner } from '~/modules/common/search-spinner';
import { ComboboxPrimitive } from '~/modules/ui/combobox';
import { skipPasswordManagers } from '~/modules/ui/input';
import { cn } from '~/utils/cn';

interface ComboboxSearchInputProps extends Omit<ComboboxPrimitive.Input.Props, 'value'> {
  value: string;
  /** Brightens the search icon; a field with chips sets it. */
  hasSearch?: boolean;
  wrapClassName?: string;
  isSearching?: boolean;
  spinnerDelay?: number;
  /** Draws the placeholder cut short with an ellipsis, which a focused input's own placeholder never gets. */
  truncatePlaceholder?: boolean;
}

/** Search-styled combobox input for the command palette and dropdowner. */
export function ComboboxSearchInput({
  className,
  wrapClassName,
  isSearching = false,
  spinnerDelay,
  value,
  hasSearch,
  placeholder,
  truncatePlaceholder,
  ref,
  ...props
}: ComboboxSearchInputProps) {
  const inputClassName = cn(
    // text-md is at least 16px on phones: iOS zooms into a focused field below that.
    'text-md placeholder:text-faint-foreground flex h-10 w-full rounded-md bg-transparent py-3 outline-hidden disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm [&::-webkit-search-cancel-button]:hidden',
    className,
  );

  const input = (
    <ComboboxPrimitive.Input
      data-slot="combobox-search-input"
      className={inputClassName}
      placeholder={truncatePlaceholder ? undefined : placeholder}
      value={value}
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      {...skipPasswordManagers}
      {...props}
      ref={(element) => {
        // type="search" is set imperatively (base-ui omits it from its types) so password managers skip the input.
        if (element) element.type = 'search';
        if (typeof ref === 'function') ref(element);
        else if (ref) ref.current = element;
      }}
    />
  );

  return (
    <div data-slot="combobox-search-input-wrapper" className={cn('group/search-input relative flex h-10 items-center border-b px-3', wrapClassName)}>
      <SearchSpinner isSearching={isSearching} hasSearch={hasSearch ?? value.length > 0} appearDelay={spinnerDelay} />
      {truncatePlaceholder ? (
        <div className="relative flex min-w-0 flex-1 items-center">
          {input}
          {/* The input's own classes, so the text sits where its placeholder would */}
          {!value && (
            <span aria-hidden="true" className={cn(inputClassName, 'text-faint-foreground pointer-events-none absolute inset-0 block truncate')}>
              {placeholder}
            </span>
          )}
        </div>
      ) : (
        input
      )}
    </div>
  );
}
