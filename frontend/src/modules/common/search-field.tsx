import { type KeyboardEvent, type ReactNode, type RefObject, useEffect, useRef, useState } from 'react';
import { useDebounce } from '~/hooks/use-debounce';
import { SearchClearButton } from '~/modules/common/search-clear-button';
import { SearchSpinner } from '~/modules/common/search-spinner';
import { InputGroup, InputGroupAddon, InputGroupInput } from '~/modules/ui/input-group';
import { cn } from '~/utils/cn';

interface SearchFieldProps {
  /** The applied query, such as the URL's `q`: the field takes it over while nobody types in it. */
  value: string;
  /** Receives the typed query once typing pauses. */
  onSearch: (value: string) => void;
  /** Accessible name, and the placeholder. */
  label: string;
  name?: string;
  id?: string;
  disabled?: boolean;
  isSearching?: boolean;
  /** What the query finds, as "4 tasks"; empty while there is no query. */
  count?: string;
  /** Beside the clear button while a query is typed, such as a find's steps. */
  children?: ReactNode;
  /** Runs before the field's own keys; an event it handles (`preventDefault`) skips them. */
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  /** Leaves out the X, for a field beside a button that clears it. */
  hideClear?: boolean;
  ref?: RefObject<HTMLInputElement | null>;
  className?: string;
}

/** How long a search waits after a keystroke before it applies. */
export const typingPause = 250;

/**
 * The input of an in-page search with words only: a list without filters, or a find in content. It applies the query once
 * typing pauses, follows the applied query from outside, and clears with its X or Escape (a second Escape leaves the field).
 */
export function SearchField({
  value,
  onSearch,
  label,
  name,
  id,
  disabled,
  isSearching = false,
  count,
  children,
  onKeyDown,
  hideClear,
  ref,
  className,
}: SearchFieldProps) {
  const ownRef = useRef<HTMLInputElement>(null);
  const inputRef = ref ?? ownRef;

  const [inputValue, setInputValue] = useState(value);
  const typedValue = useDebounce(inputValue, typingPause);
  const sentRef = useRef(value);

  const send = (next: string) => {
    sentRef.current = next;
    onSearch(next);
  };

  useEffect(() => {
    if (typedValue !== value) send(typedValue);
  }, [typedValue]);

  // A field in use keeps its text against a query still on its way; only a clear it did not send itself reaches it
  useEffect(() => {
    const isClearedOutside = !value && !!sentRef.current;
    if (isClearedOutside) sentRef.current = '';
    if (isClearedOutside || document.activeElement !== inputRef.current) setInputValue(value);
  }, [value]);

  const clear = () => {
    setInputValue('');
    send('');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;

    if (event.key === 'Escape') {
      if (inputValue) clear();
      else event.currentTarget.blur();
    }
  };

  return (
    <InputGroup className={className}>
      <InputGroupInput
        ref={inputRef}
        id={id}
        name={name}
        className="pl-0!"
        disabled={disabled}
        placeholder={label}
        aria-label={label}
        value={inputValue}
        enterKeyHint="search"
        onChange={(event) => setInputValue(event.target.value)}
        onKeyDown={handleKeyDown}
      />

      <InputGroupAddon className="pl-1.5 sm:pl-[calc(1rem-1px)]">
        <SearchSpinner hasSearch={!!inputValue} isSearching={isSearching} />
      </InputGroupAddon>

      <InputGroupAddon className="gap-0.5 pr-1.5 has-[>button]:mr-0" align="inline-end">
        {/* Mounted while empty too: a status region announces changes only once it exists */}
        {count !== undefined && (
          <span role="status" className="mr-1 whitespace-nowrap font-normal text-muted-foreground text-sm tabular-nums">
            {inputValue && count}
          </span>
        )}
        {inputValue && children}
        {!hideClear && (
          <SearchClearButton
            className={cn(!inputValue && 'invisible')}
            onClick={() => {
              clear();
              inputRef.current?.focus();
            }}
          />
        )}
      </InputGroupAddon>
    </InputGroup>
  );
}
