import { Loader2, Search, X, XCircle } from 'lucide-react';
import * as React from 'react';

import { Command as CommandPrimitive } from 'cmdk';
import { useEffect } from 'react';
import { cn } from '~/lib/utils';
import { Badge } from '~/modules/ui/badge';
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '~/modules/ui/command';

import { AvatarWrap } from './avatar-wrap';
import { ScrollArea } from '../ui/scroll-area';

export interface Option {
  value: string;
  label: string;
  disable?: boolean;
  selected?: boolean;
  /** fixed option that can't be removed. */
  fixed?: boolean;
  /** Group the options by providing key. */
  [key: string]: string | boolean | undefined;
}

interface MultipleSelectorProps {
  value?: Option[];
  defaultOptions?: Option[];
  /** manually controlled options */
  options?: Option[];
  placeholder?: string;
  createPlaceholder?: string;
  /** Empty component. */
  emptyIndicator?: React.ReactNode;
  /** Debounce time for async search. Only work with `onSearch`. */
  delay?: number;
  /**
   * Only work with `onSearch` prop. Trigger search when `onFocus`.
   * For example, when user click on the input, it will trigger the search to get initial options.
   **/
  triggerSearchOnFocus?: boolean;
  /** async search */
  onSearch?: (value: string) => Promise<Option[]>;
  onChange?: (options: Option[]) => void;
  /** Limit the maximum number of selected options. */
  maxSelected?: number;
  /** EDIT: Limit the minimum number of selected options. */
  minSelected?: number;
  /** When the number of selected options exceeds the limit, the onMaxSelected will be called. */
  onMaxSelected?: (maxLimit: number) => void;
  /** Hide the placeholder when there are options selected. */
  hidePlaceholderWhenSelected?: boolean;
  disabled?: boolean;
  /** Group the options base on provided key. */
  className?: string;
  badgeClassName?: string;
  emptyValue?: string;
  basicSignValue?: string;
  /**
   * First item selected is a default behavior by cmdk. That is why the default is true.
   * This is a workaround solution by add a dummy item.
   *
   * @reference: https://github.com/pacocoursey/cmdk/issues/171
   */
  selectFirstItem?: boolean;
  /** Allow user to create option when there is no option matched. */
  creatable?: boolean;
  /** Props of `Command` */
  commandProps?: React.ComponentPropsWithoutRef<typeof Command>;
  /** Props of `CommandInput` */
  inputProps?: Omit<React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>, 'value' | 'placeholder' | 'disabled'>;
  /** Custom item component. */
  itemComponent?: (item: Option) => React.ReactNode;
}

export interface MultipleSelectorRef {
  selectedValue: Option[];
  input: HTMLInputElement;
}

export function useDebounce<T>(value: T, delay?: number): T {
  const [debouncedValue, setDebouncedValue] = React.useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay || 200);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

function removePickedOption(option: Option[], picked: Option[]) {
  return option.filter((val) => !picked.find((p) => p.value === val.value));
}

function highlightPickedOption(option: Option[], picked: Option[]) {
  return option.map((val) => {
    const isPicked = picked.find((p) => p.value === val.value);
    val.selected = !!isPicked;
    return val;
  });
}

const MultipleSelector = React.forwardRef<MultipleSelectorRef, MultipleSelectorProps>(
  (
    {
      value,
      onChange,
      placeholder,
      defaultOptions: arrayDefaultOptions = [],
      options: arrayOptions,
      delay,
      onSearch,
      maxSelected = Number.MAX_SAFE_INTEGER,
      onMaxSelected,
      hidePlaceholderWhenSelected,
      disabled,
      className,
      badgeClassName,
      emptyIndicator,
      creatable = false,
      triggerSearchOnFocus = false,
      commandProps,
      inputProps,
      emptyValue,
      createPlaceholder,
      basicSignValue,
      itemComponent,
    }: MultipleSelectorProps,
    ref: React.Ref<MultipleSelectorRef>,
  ) => {
    const inputRef = React.useRef<HTMLInputElement>(null);
    const [isShowResults, setShowResults] = React.useState(false);
    const [isLoading, setIsLoading] = React.useState(false);

    const [selected, setSelected] = React.useState<Option[]>(value || []);
    const [options, setOptions] = React.useState<Option[]>(arrayDefaultOptions || []);
    const [inputValue, setInputValue] = React.useState('');
    const debouncedSearchTerm = useDebounce(inputValue, delay || 200);

    React.useImperativeHandle(
      ref,
      () => ({
        selectedValue: [...selected],
        input: inputRef.current as HTMLInputElement,
      }),
      [selected],
    );

    const handleUnselect = React.useCallback(
      (option: Option) => {
        const newOptions = selected.filter((s) => s.value !== option.value);
        setSelected(newOptions);
        onChange?.(newOptions);
      },
      [selected],
    );
    const handleKeyDown = React.useCallback(
      (e: React.KeyboardEvent<HTMLDivElement>) => {
        const input = inputRef.current;
        if (input && (e.key === 'Delete' || e.key === 'Backspace')) {
          if (input.value === '' && selected.length > 0) handleUnselect(selected[selected.length - 1]);
        }
      },
      [selected],
    );

    const onInputFocus = (event: React.FocusEvent<HTMLInputElement, Element>) => {
      setShowResults(true);
      triggerSearchOnFocus && onSearch?.(debouncedSearchTerm);
      inputProps?.onFocus?.(event);
    };

    const onInputBlur = (event: React.FocusEvent<HTMLInputElement, Element>) => {
      setShowResults(false);
      inputProps?.onBlur?.(event);
    };

    const onValueChange = (value: string) => {
      setInputValue(value);
      inputProps?.onValueChange?.(value);
    };

    const onItemSelect = (option: Option) => {
      if (option.selected) {
        handleUnselect(option);
        return;
      }
      if (selected.length >= maxSelected) {
        onMaxSelected?.(selected.length);
        return;
      }
      setInputValue('');
      const newOptions = [...selected, option];
      setSelected(newOptions);
      onChange?.(newOptions);
    };

    const onMouseDown = (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
      event.preventDefault();
      event.stopPropagation();
    };

    useEffect(() => {
      /** If `onSearch` is provided, do not trigger options updated. */
      if (!arrayOptions || onSearch) return;

      const newOption = arrayOptions;
      if (JSON.stringify(newOption) !== JSON.stringify(options)) {
        setOptions(newOption);
      }
    }, [arrayDefaultOptions, arrayOptions, onSearch, options]);

    useEffect(() => {
      if (debouncedSearchTerm.length === 0) return;
      const doSearch = async () => {
        setIsLoading(true);
        const res = await onSearch?.(debouncedSearchTerm);
        setOptions(res || []);
        setIsLoading(false);
      };
      const exec = async () => {
        if (!onSearch || !isShowResults) return;
        if (triggerSearchOnFocus || debouncedSearchTerm) await doSearch();
      };
      void exec();
    }, [debouncedSearchTerm, isShowResults]);

    const selectable = React.useMemo<Option[]>(() => {
      //EDIT: only filter options in search mode
      if (!onSearch) return highlightPickedOption(options, selected);
      return removePickedOption(options, selected);
    }, [options, selected]);

    /** Avoid Creatable Selector freezing or lagging when paste a long string. */
    const commandFilter = React.useCallback(() => {
      if (commandProps?.filter) {
        return commandProps.filter;
      }

      if (creatable) {
        return (value: string, search: string) => {
          return value.toLowerCase().includes(search.toLowerCase()) ? 1 : -1;
        };
      }
      // Using default filter in `cmdk`. We don't have to provide it.
      return undefined;
    }, [creatable, commandProps?.filter]);

    const CreatableItem = () => {
      if (!creatable) return undefined;

      const Item = (
        <CommandItem
          value={inputValue}
          className="cursor-pointer"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onSelect={(value: string) => {
            if (selected.length >= maxSelected) {
              onMaxSelected?.(selected.length);
              return;
            }
            setInputValue('');
            const newOptions = [...selected, { value, label: value }];
            setSelected(newOptions);
            onChange?.(newOptions);
          }}
        >
          <>
            <span className="mr-1">{createPlaceholder || 'Create'}</span>
            <strong>{inputValue}</strong>
          </>
        </CommandItem>
      );

      // For normal creatable
      if (!onSearch && inputValue.length > 0) {
        return Item;
      }

      // For async search creatable. avoid showing creatable item before loading at first.
      if (onSearch && debouncedSearchTerm.length > 0 && !isLoading) {
        return Item;
      }

      return undefined;
    };

    return (
      <Command
        {...commandProps}
        onKeyDown={(e) => {
          handleKeyDown(e);
          commandProps?.onKeyDown?.(e);
        }}
        className={cn('overflow-visible bg-transparent', commandProps?.className)}
        shouldFilter={commandProps?.shouldFilter !== undefined ? commandProps.shouldFilter : !onSearch} // When onSearch is provided, we don't want to filter the options. You can still override it.
        filter={commandFilter()}
      >
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: <explanation> */}
        <div
          className={cn(
            'group rounded-md border border-input px-3 py-2 text-sm ring-offset-background bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 cursor-text',
            className,
          )}
          onClick={() => {
            if (inputRef?.current) inputRef.current.focus();
          }}
        >
          <div className="flex flex-wrap items-center gap-1 -my-0.5">
            {onSearch && !selected.length && <Search className="h-4 w-4 shrink-0" style={{ opacity: inputValue ? 1 : 0.5 }} />}
            {selected.map((option) => (
              <Badge
                variant="secondary"
                key={option.value}
                className={cn(
                  'data-[disabled]:bg-muted-foreground data-[disabled]:text-muted data-[disabled]:hover:bg-muted-foreground',
                  'data-[fixed]:bg-muted-foreground data-[fixed]:text-muted data-[fixed]:hover:bg-muted-foreground',
                  badgeClassName,
                )}
                data-fixed={option.fixed}
                data-disabled={disabled}
              >
                {option.label}
                <button
                  type="button"
                  className={cn(
                    'py-1 m-[-4px] ml-1 rounded-full outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2',
                    (disabled || option.fixed) && 'hidden',
                  )}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleUnselect(option);
                    }
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onClick={() => handleUnselect(option)}
                >
                  <X className="h-4 w-4 opacity-50 hover:opacity-100" />
                </button>
              </Badge>
            ))}
            <div className="relative flex-grow">
              <CommandPrimitive.Input
                {...inputProps}
                ref={inputRef}
                value={inputValue}
                aria-autocomplete='none'
                autoComplete='off'
                disabled={disabled}
                onValueChange={(value) => onValueChange(value)}
                onBlur={onInputBlur}
                onFocus={onInputFocus}
                placeholder={hidePlaceholderWhenSelected && selected.length !== 0 ? '' : placeholder}
                className={cn(
                  'h-6 w-full flex-1 bg-transparent outline-none placeholder:text-muted-foreground',
                  inputProps?.className,
                  selected.length && 'ml-2 ',
                )}
              />
              {inputValue.length > 0 && (
                <XCircle
                  size={16}
                  className="absolute -right-1 opacity-70 hover:opacity-100 -translate-y-[120%] cursor-pointer"
                  onClick={() => {
                    setInputValue('');
                    setOptions(arrayDefaultOptions); // Set options to default options
                  }}
                />
              )}
            </div>
          </div>
        </div>
        {isShowResults && (
          <div className="relative">
            <CommandList
              className={cn(
                'absolute mt-2 top-0 z-10 w-full !h-auto rounded-md bg-popover text-popover-foreground shadow-md outline-none animate-in',
                (inputValue.length || selectable.length || basicSignValue) && 'border',
              )}
            >
              {isLoading && (
                <CommandEmpty>
                  <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
                </CommandEmpty>
              )}

              {CreatableItem()}

              {selectable.length < 1 && inputValue.length > 0 && !isLoading && <CommandEmpty>{emptyValue}</CommandEmpty>}
              {inputValue.length === 0 && basicSignValue && <CommandEmpty>{basicSignValue}</CommandEmpty>}
              {inputValue.length > 0 && emptyIndicator && <CommandEmpty>{emptyIndicator}</CommandEmpty>}

              {!!selectable.length && (
                <ScrollArea className="max-h-[30vh]">
                  <CommandGroup className="px-1">
                    {selectable.map((option) => (
                      <CommandItem
                        key={option.label}
                        onSelect={() => onItemSelect(option)}
                        value={option.value}
                        disabled={option.disable}
                        onMouseDown={onMouseDown}
                        className={cn('cursor-pointer', option.disable && 'cursor-default text-muted-foreground', option.selected && 'font-semibold')}
                      >
                        {itemComponent ? (
                          itemComponent(option)
                        ) : (
                          <div className="flex space-x-2 items-center outline-0 ring-0 group">
                            <AvatarWrap type="user" className="h-8 w-8" id={option.label} name={option.value} />
                            <span className="group-hover:underline underline-offset-4 truncate font-medium">{option.label}</span>
                          </div>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </ScrollArea>
              )}
            </CommandList>
          </div>
        )}
      </Command>
    );
  },
);

MultipleSelector.displayName = 'MultipleSelector';
export default MultipleSelector;
