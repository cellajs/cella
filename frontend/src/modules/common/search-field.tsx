import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import { type KeyboardEvent, type ReactNode, type RefObject, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDebounce } from '~/hooks/use-debounce';
import type { MatchSteps } from '~/modules/common/match-highlight/use-match-steps';
import { SearchClearButton } from '~/modules/common/search-clear-button';
import { SearchSpinner } from '~/modules/common/search-spinner';
import { InputGroup, InputGroupAddon, InputGroupInput } from '~/modules/ui/input-group';
import { cn } from '~/utils/cn';
import { tw } from '~/utils/tw';

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
  /** Matches found in the content, stepped through with the arrows, Enter and Shift+Enter. */
  steps?: MatchSteps;
  /** Beside the clear button while a query is typed, such as a match mode. */
  children?: ReactNode;
  /** Runs before the field's own keys; an event it handles (`preventDefault`) skips them. */
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  ref?: RefObject<HTMLInputElement | null>;
  className?: string;
}

const typingPause = 250;

const stepButtonClass = tw('focus-effect flex size-7 items-center justify-center rounded-md hover:bg-muted disabled:opacity-50');

/**
 * The input of an in-page search: a list's filter or a find in content. It applies the query once typing pauses, follows
 * the applied query from outside, clears with its X or Escape (a second Escape leaves the field), and with `steps` shows
 * where the current match is.
 */
export function SearchField({
  value,
  onSearch,
  label,
  name,
  id,
  disabled,
  isSearching = false,
  steps,
  children,
  onKeyDown,
  ref,
  className,
}: SearchFieldProps) {
  const { t } = useTranslation();
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

    if (event.key === 'Enter' && steps?.total) {
      event.preventDefault();
      if (event.shiftKey) steps.previous();
      else steps.next();
    } else if (event.key === 'Escape') {
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
        {inputValue && steps && (
          <>
            <span className="mr-1 whitespace-nowrap text-muted-foreground text-sm tabular-nums">
              {steps.total === 0 && t('c:no_results')}
              {steps.total > 0 && (steps.index >= 0 ? t('c:match_position', { current: steps.index + 1, total: steps.total }) : steps.total)}
            </span>
            {/* Mouse down keeps focus in the field, so typing goes on after a step */}
            <button
              type="button"
              aria-label={t('c:previous')}
              className={stepButtonClass}
              disabled={!steps.total}
              onMouseDown={(event) => event.preventDefault()}
              onClick={steps.previous}
            >
              <ChevronUpIcon className="size-4" />
            </button>
            <button
              type="button"
              aria-label={t('c:next')}
              className={stepButtonClass}
              disabled={!steps.total}
              onMouseDown={(event) => event.preventDefault()}
              onClick={steps.next}
            >
              <ChevronDownIcon className="size-4" />
            </button>
            <span className="sr-only" aria-live="polite">
              {steps.announcement}
            </span>
          </>
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
