import { SearchSpinner } from '~/modules/common/search-spinner';
import { ComboboxPrimitive } from '~/modules/ui/combobox';
import { skipPasswordManagers } from '~/modules/ui/input';
import { cn } from '~/utils/cn';

interface ComboboxSearchInputProps extends Omit<ComboboxPrimitive.Input.Props, 'value'> {
  value: string;
  /** Brightens the search icon. Defaults to having text; a field with chips beside its input says so itself. */
  hasSearch?: boolean;
  wrapClassName?: string;
  isSearching?: boolean;
  spinnerDelay?: number;
}

/** Search-styled combobox input for the command palette and dropdowner. */
export function ComboboxSearchInput({
  className,
  wrapClassName,
  isSearching = false,
  spinnerDelay,
  value,
  hasSearch,
  ref,
  ...props
}: ComboboxSearchInputProps) {
  return (
    <div data-slot="combobox-search-input-wrapper" className={cn('group/search-input relative flex h-10 items-center border-b px-3', wrapClassName)}>
      <SearchSpinner isSearching={isSearching} hasSearch={hasSearch ?? value.length > 0} appearDelay={spinnerDelay} />
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
        {...skipPasswordManagers}
        {...props}
        ref={(element) => {
          // type="search" is set imperatively (base-ui omits it from its types) so password managers skip the input.
          if (element) element.type = 'search';
          if (typeof ref === 'function') ref(element);
          else if (ref) ref.current = element;
        }}
      />
    </div>
  );
}
