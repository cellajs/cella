import { HistoryIcon, SearchIcon } from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { foldText, matchesTerms } from 'shared/utils/text-match';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { useDebounce } from '~/hooks/use-debounce';
import { CloseButton } from '~/modules/common/close-button';
import { HighlightText } from '~/modules/common/match-highlight/highlight-text';
import { MatchScope } from '~/modules/common/match-highlight/match-scope';
import { SearchClearButton } from '~/modules/common/search-clear-button';
import { SearchSpinner } from '~/modules/common/search-spinner';
import { Chip } from '~/modules/ui/chip';
import { Combobox, ComboboxContent, ComboboxGroup, ComboboxItem, ComboboxList, ComboboxPrimitive, ComboboxSeparator } from '~/modules/ui/combobox';
import { InputGroup, InputGroupAddon, InputGroupInput } from '~/modules/ui/input-group';
import { Kbd } from '~/modules/ui/kbd';
import { cn } from '~/utils/cn';

export interface SearchChip {
  key: string;
  label: string;
  icon?: ReactNode;
  onRemove: () => void;
}

export interface SearchOption {
  value: string;
  label: string;
  icon?: ReactNode;
  /** The items choosing this option would show. */
  count?: number;
  isSelected: boolean;
}

/** One filter of a list. Its values widen each other; different filters and the search words narrow. */
export interface SearchOptionGroup {
  key: string;
  /** Names the row for assistive technology; a row shows no heading. */
  label: string;
  options: SearchOption[];
  onToggle: (value: string) => void;
  /** Smaller chips, for a row of many values such as labels. */
  isCompact?: boolean;
}

/** A search made before, with its filters. */
export interface SearchRecent {
  key: string;
  text: string;
  chips: Pick<SearchChip, 'label' | 'icon'>[];
  onPick: () => void;
  onRemove: () => void;
}

/** What a list offers beside its search words: the filters and their chips, and optionally its recent searches. */
export interface SearchFilters {
  groups: SearchOptionGroup[];
  chips: SearchChip[];
  recents?: SearchRecent[];
  /** The field closed on this search, to remember it. */
  onSearchEnd?: (q: string) => void;
}

interface SearchChipsFieldProps extends SearchFilters {
  /** The applied search words, such as the URL's `q`. */
  value: string;
  /** Receives the words once typing pauses, and at once when a chip goes. */
  onSearch: (value: string) => void;
  /** Clears the words and every filter. */
  onReset: () => void;
  /** Accessible name, and the placeholder. */
  label: string;
  name?: string;
  id?: string;
  disabled?: boolean;
  isSearching?: boolean;
  /** What the search finds, as "4 tasks"; empty while nothing narrows the list. */
  count?: string;
  className?: string;
}

type SearchSelection =
  | { kind: 'text' }
  | { kind: 'option'; group: SearchOptionGroup; option: SearchOption }
  | { kind: 'recent'; recent: SearchRecent };

const typingPause = 250;

const wordSeparators = /[\s,]+/;
const splitWords = (text: string) => text.split(wordSeparators).filter(Boolean);
const joinQuery = (words: string[], draft: string) => [...words, draft.trim()].filter(Boolean).join(' ');

const isComposing = (event: Event) => event instanceof InputEvent && event.isComposing;
const isTouch = () => window.matchMedia('(pointer: coarse)').matches;

// A touch device keeps the options on focus out: a chip's press lowers the keyboard, and the options stay to pick more
const closingReasons = new Set(['outside-press', 'escape-key', 'focus-out']);

const filterChipClass =
  'border-transparent bg-primary text-primary-foreground [&_button]:hover:bg-primary-foreground/20 [&_button]:hover:text-primary-foreground';
const phoneChipClass = 'h-9 shrink-0 pl-3 [&_button]:size-8';

/**
 * A search where every word and filter is its own chip with its own X. The input holds only the word being typed, which
 * filters as it is typed: a space, a comma, Enter or leaving the field turns it into a chip. An empty input offers every
 * filter and the recent searches, an input with text suggests what matches it. From `sm` up the chips sit in the field; on a
 * phone they scroll in a row below it.
 */
export function SearchChipsField({
  value,
  onSearch,
  onReset,
  label,
  name,
  id,
  disabled,
  isSearching = false,
  count = '',
  groups,
  chips,
  recents = [],
  onSearchEnd,
  className,
}: SearchChipsFieldProps) {
  const { t } = useTranslation();
  const isMobile = useBreakpointBelow('sm');
  const inputRef = useRef<HTMLInputElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const highlightedRef = useRef<SearchSelection | undefined>(undefined);

  const [words, setWords] = useState(() => splitWords(value));
  const [draft, setDraft] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const query = joinQuery(words, draft);
  const typedQuery = useDebounce(query, typingPause);
  const sentRef = useRef(value);

  const send = (next: string) => {
    sentRef.current = next;
    onSearch(next);
  };

  useEffect(() => {
    if (typedQuery !== sentRef.current) send(typedQuery);
  }, [typedQuery]);

  // A change from outside, such as a reset, a recent search or the back button
  useEffect(() => {
    if (value === sentRef.current) return;
    sentRef.current = value;
    setWords(splitWords(value));
    setDraft('');
  }, [value]);

  const word = draft.trim();
  const isTyping = isOpen && !!word;
  const terms = word ? [foldText(word)] : [];
  const hasOptions = groups.length > 0 || recents.length > 0;

  const close = () => {
    setIsOpen(false);
    const nextWords = word && !words.includes(word) ? [...words, word] : words;
    setWords(nextWords);
    setDraft('');
    const next = joinQuery(nextWords, '');
    if (next !== sentRef.current) send(next);
    onSearchEnd?.(next);
  };

  const dropDraft = () => {
    setDraft('');
    send(joinQuery(words, ''));
  };

  const removeWord = (removed: string) => {
    const next = words.filter((other) => other !== removed);
    setWords(next);
    send(joinQuery(next, draft));
  };

  const reset = () => {
    setWords([]);
    setDraft('');
    sentRef.current = '';
    onReset();
    inputRef.current?.focus();
  };

  const pick = (selection: SearchSelection | null) => {
    if (!selection) return;
    if (selection.kind === 'text') return close();
    if (selection.kind === 'recent') {
      selection.recent.onPick();
      return setIsOpen(false);
    }
    selection.group.onToggle(selection.option.value);
    // A suggestion replaces the word that found it; a chip leaves the options open to pick more
    if (isTyping) {
      dropDraft();
      setIsOpen(false);
    } else if (isTouch()) inputRef.current?.blur();
  };

  const handleInputChange = (next: string, event: Event) => {
    const parts = isComposing(event) ? [next] : next.split(wordSeparators);
    const finished = parts.slice(0, -1).filter((part) => part && !words.includes(part));
    if (finished.length) setWords([...words, ...finished]);
    setDraft(parts.at(-1) ?? '');
    if (hasOptions) setIsOpen(true);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement> & { preventBaseUIHandler: () => void }) => {
    if (event.key === 'Enter' && !highlightedRef.current) {
      event.preventDefault();
      close();
      if (isTouch()) event.currentTarget.blur();
    } else if (event.key === 'Escape' && draft) {
      event.preventBaseUIHandler();
      dropDraft();
    } else if (event.key === 'Escape' && !isOpen) {
      event.currentTarget.blur();
    } else if (event.key === 'Backspace' && !draft) {
      // A keyword comes back to be edited; a filter just goes
      const lastWord = words.at(-1);
      if (lastWord) {
        // Else the key goes on to delete the word's last character
        event.preventDefault();
        setWords(words.slice(0, -1));
        setDraft(lastWord);
      } else chips.at(-1)?.onRemove();
    }
  };

  const wordChips: SearchChip[] = words.map((text) => ({ key: `word:${text}`, label: text, onRemove: () => removeWord(text) }));

  const chipNodes = (
    <>
      {chips.map((chip) => (
        <Chip
          key={chip.key}
          onRemove={chip.onRemove}
          removeLabel={t('c:remove_resource', { resource: chip.label })}
          className={cn('max-w-48', filterChipClass, isMobile && phoneChipClass)}
        >
          <span className="flex items-center gap-1 [&_svg]:size-3.5 [&_svg]:shrink-0">
            {chip.icon}
            {chip.label}
          </span>
        </Chip>
      ))}
      {wordChips.map((chip) => (
        <Chip
          key={chip.key}
          onRemove={chip.onRemove}
          removeLabel={t('c:remove_resource', { resource: chip.label })}
          className={cn('max-w-48', isMobile && phoneChipClass)}
        >
          {chip.label}
        </Chip>
      ))}
    </>
  );
  const hasChips = chips.length > 0 || words.length > 0;

  const optionMatches = groups.flatMap((group) =>
    group.options.filter((option) => matchesTerms([foldText(option.label)], terms)).map((option) => ({ group, option })),
  );
  const recentMatches = recents
    .filter((recent) => matchesTerms([foldText(recent.text)], terms) && foldText(recent.text) !== foldText(word))
    .slice(0, 2);

  const groupRow = (group: SearchOptionGroup) => (
    <ComboboxGroup key={group.key} aria-label={group.label} className="no-scrollbar flex gap-1 overflow-x-auto border-b px-3 py-2 last:border-b-0">
      {group.options.map((option) => (
        <ComboboxItem
          key={option.value}
          value={{ kind: 'option', group, option } satisfies SearchSelection}
          aria-selected={option.isSelected}
          className={cn(
            'w-auto shrink-0 rounded-full border border-input px-2.5 py-0',
            group.isCompact ? 'h-6.5 pointer-coarse:h-8.5' : 'h-7.5 pointer-coarse:h-10',
            option.isSelected &&
              'border-transparent bg-primary text-primary-foreground data-highlighted:bg-primary data-highlighted:text-primary-foreground',
          )}
        >
          {option.icon}
          {option.label}
          {option.count !== undefined && (
            <span className={cn('text-xs tabular-nums', !option.isSelected && 'text-muted-foreground')}>{option.count}</span>
          )}
        </ComboboxItem>
      ))}
    </ComboboxGroup>
  );

  return (
    <div ref={fieldRef} className={cn('flex min-w-0 grow flex-col gap-1', className)}>
      <Combobox<SearchSelection>
        value={null}
        onValueChange={pick}
        inputValue={draft}
        onInputValueChange={(next, { reason, event }) => {
          // A pick writes the row's text into the input: only typing changes it
          if (reason === 'input-change') handleInputChange(next, event);
        }}
        open={isOpen && hasOptions}
        onOpenChange={(next, { reason }) => {
          if (next) setIsOpen(true);
          else if (closingReasons.has(reason) && !(reason === 'focus-out' && isTouch())) close();
        }}
        onItemHighlighted={(item) => {
          highlightedRef.current = item;
        }}
        filter={() => true}
        itemToStringLabel={() => ''}
      >
        <InputGroup ref={groupRef} className="h-auto min-h-10 flex-wrap">
          <InputGroupAddon className="pl-1.5">
            <SearchSpinner value={query} isSearching={isSearching} />
          </InputGroupAddon>

          {!isMobile && hasChips && <div className="flex flex-wrap items-center gap-1 py-1 pr-1">{chipNodes}</div>}

          <ComboboxPrimitive.Input
            ref={inputRef}
            render={<InputGroupInput className="min-w-24 pl-0!" />}
            id={id}
            name={name}
            disabled={disabled}
            placeholder={!isMobile && hasChips ? undefined : label}
            aria-label={label}
            enterKeyHint="search"
            onFocus={() => {
              if (hasOptions) setIsOpen(true);
            }}
            // A suggestion closes the options before focus leaves, so this ends that search
            onBlur={() => {
              if (!isOpen) onSearchEnd?.(query);
            }}
            onKeyDown={handleKeyDown}
          />

          <InputGroupAddon className="gap-0.5 pr-2" align="inline-end">
            {/* Mounted while empty too: a status region announces changes only once it exists */}
            <span role="status" className="mr-1 whitespace-nowrap text-muted-foreground text-sm tabular-nums">
              {count}
            </span>
            <SearchClearButton className={cn(!query && !chips.length && 'invisible')} onClick={reset} />
          </InputGroupAddon>
        </InputGroup>

        <ComboboxContent anchor={isMobile ? fieldRef : groupRef} className="min-w-80 max-w-[min(51.25rem,var(--available-width))]">
          <ComboboxList className="p-0">
            {isTyping ? (
              <div className="p-1">
                <ComboboxItem value={{ kind: 'text' } satisfies SearchSelection}>
                  <SearchIcon className="text-muted-foreground" />
                  <span className="truncate">{t('c:search_for', { query: word })}</span>
                  <Kbd className="ml-auto max-sm:hidden">Enter</Kbd>
                </ComboboxItem>
                <MatchScope terms={terms}>
                  {optionMatches.length > 0 && <ComboboxSeparator />}
                  {optionMatches.map(({ group, option }) => (
                    <ComboboxItem key={`${group.key}:${option.value}`} value={{ kind: 'option', group, option } satisfies SearchSelection}>
                      {option.icon}
                      <span className="truncate">
                        <HighlightText text={option.label} />
                      </span>
                      {option.count !== undefined && <span className="ml-auto text-muted-foreground text-xs tabular-nums">{option.count}</span>}
                    </ComboboxItem>
                  ))}
                  {recentMatches.length > 0 && <ComboboxSeparator />}
                  {recentMatches.map((recent) => (
                    <ComboboxItem key={recent.key} value={{ kind: 'recent', recent } satisfies SearchSelection}>
                      <HistoryIcon className="text-muted-foreground" />
                      <span className="truncate">
                        <HighlightText text={recent.text} />
                      </span>
                    </ComboboxItem>
                  ))}
                </MatchScope>
              </div>
            ) : (
              <>
                {groups.filter((group) => !group.isCompact).map(groupRow)}
                {recents.length > 0 && (
                  <ComboboxGroup aria-label={t('c:history')} className="border-b p-1 last:border-b-0">
                    {recents.map((recent) => (
                      <ComboboxItem key={recent.key} value={{ kind: 'recent', recent } satisfies SearchSelection} className="justify-between">
                        <div className="flex min-w-0 items-center gap-2">
                          <HistoryIcon className="text-muted-foreground" />
                          {recent.chips.map((chip) => (
                            <Chip key={chip.label} className="shrink-0">
                              <span className="flex items-center gap-1 [&_svg]:size-3.5 [&_svg]:shrink-0">
                                {chip.icon}
                                {chip.label}
                              </span>
                            </Chip>
                          ))}
                          <span className="truncate">{recent.text}</span>
                        </div>
                        <CloseButton
                          size="sm"
                          label="c:remove"
                          onClick={(event) => {
                            event.stopPropagation();
                            recent.onRemove();
                          }}
                        />
                      </ComboboxItem>
                    ))}
                  </ComboboxGroup>
                )}
                {groups.filter((group) => group.isCompact).map(groupRow)}
              </>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>

      {isMobile && hasChips && <div className="no-scrollbar flex gap-1.5 overflow-x-auto">{chipNodes}</div>}
    </div>
  );
}
