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
  ref?: RefObject<HTMLInputElement | null>;
  className?: string;
}

const typingPause = 250;

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
  ref,
  className,
}: SearchFieldProps) {
  const ownRef = useRef<HTMLInputElement>(null);
  const inputRef = ref ?? ownRef;

  const [inputValue, setInputValue] = useState(value);
  const typedValue = useDebounce(inputValue, typingPause);

  useEffect(() => {
    if (typedValue !== value) onSearch(typedValue);
  }, [typedValue]);

  useEffect(() => {
    if (document.activeElement !== inputRef.current) setInputValue(value);
  }, [value]);

  const clear = () => {
    setInputValue('');
    onSearch('');
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

      <InputGroupAddon className="pl-1.5">
        <SearchSpinner value={inputValue} isSearching={isSearching} />
      </InputGroupAddon>

      <InputGroupAddon className="gap-0.5 pr-2" align="inline-end">
        {/* Mounted while empty too: a status region announces changes only once it exists */}
        {count !== undefined && (
          <span role="status" className="mr-1 whitespace-nowrap text-muted-foreground text-sm tabular-nums">
            {inputValue && count}
          </span>
        )}
        {inputValue && children}
        <SearchClearButton
          className={cn(!inputValue && 'invisible')}
          onClick={() => {
            clear();
            inputRef.current?.focus();
          }}
        />
      </InputGroupAddon>
    </InputGroup>
  );
}
