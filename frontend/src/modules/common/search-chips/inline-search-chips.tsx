import { type FocusEvent, type KeyboardEvent, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useEventListener } from '~/hooks/use-event-listener';
import { countText } from '~/modules/common/search-chips/count-text';
import { FilterChip, MoreChipsButton, WordChip } from '~/modules/common/search-chips/search-chip-items';
import { SearchOptionsList, searchComboboxProps } from '~/modules/common/search-chips/search-options';
import type { SearchChip, SearchChipsFieldProps, SearchOption, SearchOptionGroup, SearchSelection } from '~/modules/common/search-chips/types';
import { useChipPicking } from '~/modules/common/search-chips/use-chip-picking';
import { useFittingChips } from '~/modules/common/search-chips/use-fitting-chips';
import { useSearchWords, type WordEdit } from '~/modules/common/search-chips/use-search-words';
import { SearchClearButton } from '~/modules/common/search-clear-button';
import { SearchSpinner } from '~/modules/common/search-spinner';
import { Chip } from '~/modules/ui/chip';
import { Combobox, ComboboxList, ComboboxPrimitive } from '~/modules/ui/combobox';
import { InputGroup, InputGroupAddon, InputGroupInput } from '~/modules/ui/input-group';
import { cn } from '~/utils/cn';
import { isTouchInteraction } from '~/utils/input-modality';
import { tw } from '~/utils/tw';

const editingChipClass = 'border-foreground-soft bg-background pr-0.5 pl-2.5';

interface PickedOption {
  group: SearchOptionGroup;
  option: SearchOption;
  /** The value a swap gives up for `option`. */
  released?: string;
}

/**
 * Whether a filter still offers a value that adds to the search once `picked` applies: one that holds several values
 * (`onReplace`) with a value left, or a one-value filter with none chosen. While one does, a pick leaves the options open.
 */
const canAddFilter = (groups: SearchOptionGroup[], picked?: PickedOption) =>
  groups.some((group) => {
    const isPicked = (option: SearchOption) => picked?.group.key === group.key && picked.option.value === option.value;
    const isChosen = (option: SearchOption) =>
      isPicked(option) ? !option.isSelected : option.isSelected && !(picked?.group.key === group.key && picked.released === option.value);
    return group.onReplace ? group.options.some((option) => !isChosen(option)) : !group.options.some(isChosen);
  });

const connectedClass = tw(
  'ring-ring focus-ring:has-[[data-slot=input-group-control]:focus-visible]:ring-offset-0 dark:bg-card border-transparent shadow-[0_8px_24px_-4px_rgb(0_0_0/0.16),0_24px_48px_-12px_rgb(0_0_0/0.2)] ring-2 dark:shadow-[0_12px_32px_rgb(0_0_0/0.6),0_32px_64px_rgb(0_0_0/0.55)]',
);

/**
 * The field from `sm` up: chips and input, with the options inside the field's own box below them, open for more picks
 * while a filter can take one. At rest it keeps one line, with "+N" for the chips that do not fit; in use it shows them
 * all, wrapping over the page below, so the bar around it never changes height.
 */
export function InlineSearchChips({
  value,
  onSearch,
  onReset,
  label,
  name,
  id,
  resultCount,
  isCountInField = false,
  isSearching = false,
  disabled,
  hideClear,
  edgeless,
  groups,
  chips,
  recents = [],
  onSearchEnd,
  className,
}: SearchChipsFieldProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const highlightedRef = useRef<SearchSelection | undefined>(undefined);
  const wordInputRef = useRef<HTMLInputElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  const [wordEdit, setWordEdit] = useState<WordEdit | null>(null);
  const search = useSearchWords({ value, onSearch, wordEdit });
  const { words, draft, typingWord, query } = search;
  const { pickingKey, setPickingKey, pickingChip, pickingGroup, hasAlternatives, applyOption } = useChipPicking(chips, groups);

  const [isOpen, setIsOpen] = useState(false);
  const [hasFocus, setHasFocus] = useState(false);

  // A chip can go from under its edit, such as by a reset, a recent search or the back button
  if (wordEdit && !words.includes(wordEdit.word)) setWordEdit(null);

  const hasOptions = groups.length > 0 || recents.length > 0;
  const isConnected = isOpen && hasOptions;
  const hasChips = chips.length > 0 || words.length > 0;
  const hasSearch = hasChips || !!typingWord;

  // On touch a chip press opens the options with no focus in the field: a tapped button takes none there
  const isInUse = hasFocus || isOpen;
  const { moreCount, hiddenClass } = useFittingChips(rowRef, [...chips.map(({ key }) => key), ...words], !isInUse);

  const close = () => {
    setPickingKey(null);
    setIsOpen(false);
    // Outside the optional call: without `onSearchEnd` its argument never runs, and the word would stay in the input
    const query = search.commitDraft();
    onSearchEnd?.(query);
  };

  // With no focus in the field no blur reports a press outside it, as after a chip press on touch
  useEventListener(
    'pointerdown',
    ({ target }) => {
      if (target instanceof Node && !fieldRef.current?.contains(target)) close();
    },
    { enabled: isOpen && !hasFocus, capture: true },
  );

  // Touch ends the search on a pick. Flushed so the blur below sees the options closed
  const endOnTouch = () => {
    if (!isTouchInteraction()) return;
    flushSync(() => setIsOpen(false));
    inputRef.current?.blur();
  };

  // Flushed so the edit's input is gone before focus moves on: its blur would save the edit again
  const endWordEdit = (save: boolean) => {
    if (!wordEdit) return;
    flushSync(() => {
      if (save) search.saveWordEdit();
      setWordEdit(null);
    });
  };

  const removeWord = (removed: string) => {
    const isEdited = wordEdit?.word === removed;
    flushSync(() => {
      search.removeWord(removed);
      setWordEdit(null);
    });
    if (isEdited) inputRef.current?.focus();
  };

  const clearOrClose = () => {
    if (!hasSearch) {
      // The input or this X, whichever a pointer or a key left focus on: its blur ends the field's use
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && fieldRef.current?.contains(focused)) focused.blur();
      else close();
      return;
    }
    onSearchEnd?.(query);
    const wasEditing = !!wordEdit;
    endWordEdit(false);
    search.clearWords();
    onReset();
    // The edit's input goes with its chip; otherwise focus stays where it is, the X now closing
    if (wasEditing) inputRef.current?.focus();
  };

  const pressFilterChip = (chip: SearchChip) => {
    endWordEdit(true);
    setPickingKey(chip.key === pickingKey ? null : chip.key);
    if (hasOptions) setIsOpen(true);
    // In the input the arrow keys walk the options; touch keeps its keyboard down for a choice between chips
    if (!isTouchInteraction()) inputRef.current?.focus();
  };

  const pressWordChip = (text: string) => {
    endWordEdit(true);
    setPickingKey(null);
    setIsOpen(false);
    // Rendered within the tap, so the input takes focus inside the gesture: iOS opens its keyboard for no later focus
    flushSync(() => setWordEdit({ word: text, text }));
    wordInputRef.current?.focus();
    wordInputRef.current?.select();
  };

  const handleWordKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' && event.key !== 'Escape') return;
    event.preventDefault();
    endWordEdit(event.key === 'Enter');
    if (!isTouchInteraction()) inputRef.current?.focus();
  };

  const handleWordBlur = ({ relatedTarget }: FocusEvent<HTMLInputElement>) => {
    endWordEdit(true);
    if (!fieldRef.current?.contains(relatedTarget)) onSearchEnd?.(query);
  };

  const pick = (selection: SearchSelection | null) => {
    if (!selection) return;
    if (selection.kind === 'recent') {
      selection.recent.onPick();
      return setIsOpen(false);
    }
    // Enter on the typed word ends the search, as in most search fields; touch drops its keyboard too, and that blur closes
    if (selection.kind === 'text') {
      if (!isTouchInteraction()) return close();
      search.commitDraft();
      return endOnTouch();
    }
    applyOption(selection.group, selection.option);
    setPickingKey(null);
    // A suggestion replaces the word that found it
    search.abandonDraft();
    // The options stay for a next pick while a filter can take one; touch ends the search on any pick
    if (canAddFilter(groups, { ...selection, released: pickingChip?.value })) endOnTouch();
    else setIsOpen(false);
  };

  const handleInputChange = (next: string, event: Event) => {
    search.typeInput(next, event);
    setPickingKey(null);
    if (hasOptions) setIsOpen(true);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement> & { preventBaseUIHandler: () => void }) => {
    if (event.key === 'Enter' && !highlightedRef.current) {
      event.preventDefault();
      close();
      if (isTouchInteraction()) event.currentTarget.blur();
    } else if (event.key === 'Escape' && (draft || isOpen)) {
      // Inline options let Escape bubble, which would close a sheet around the field
      event.preventBaseUIHandler();
      event.stopPropagation();
      if (draft) search.abandonDraft();
      else if (pickingChip) setPickingKey(null);
      else close();
    } else if (event.key === 'Escape') {
      event.currentTarget.blur();
    } else if (event.key === 'ArrowDown' && !isOpen && hasOptions) {
      setIsOpen(true);
    } else if (event.key === 'Backspace' && !draft) {
      // Else the key goes on to delete the word's last character
      if (search.takeBackLastWord()) event.preventDefault();
      else chips.at(-1)?.onRemove();
    }
  };

  return (
    // Holds the field's one line in the bar; its layer sits above the list and below a sticky page header
    <div
      ref={fieldRef}
      data-in-use={isInUse || undefined}
      className={cn('relative z-30 h-10 min-w-0 grow', className)}
      onFocus={() => setHasFocus(true)}
      onBlur={({ currentTarget, relatedTarget }) => {
        if (currentTarget.contains(relatedTarget)) return;
        setHasFocus(false);
        // A word edit's blur ends the search itself, and saves the edit this listener does not see yet
        if (!wordEdit) close();
      }}
    >
      <Combobox<SearchSelection>
        {...searchComboboxProps}
        // The options render inside the field's own box, so field and options move, resize and hide as one. `open` still
        // tells Base UI they are there: Enter picks a highlighted option only while open
        inline
        open={isConnected}
        disabled={disabled}
        onValueChange={pick}
        inputValue={draft}
        onInputValueChange={(next, { reason, event }) => {
          // A pick writes the row's text into the input: only typing changes it
          if (reason === 'input-change') handleInputChange(next, event);
        }}
        onItemHighlighted={(item) => {
          highlightedRef.current = item;
        }}
      >
        <ComboboxPrimitive.InputGroup
          // Input and clear addon fit inside the border, so one line stands as tall as the h-10 buttons beside it
          render={
            <InputGroup
              className={cn('absolute inset-x-0 top-0 h-auto min-h-10 flex-col items-stretch', isConnected ? connectedClass : edgeless && 'edgeless')}
            />
          }
          // A press on the field's line ends a chip's picking and opens closed options again, as a fresh focus does; chips
          // and the options below handle their own presses
          onClick={({ target }) => {
            if (!(target instanceof Element) || target.closest('button, [data-slot=chip], [data-slot=combobox-list]')) return;
            setPickingKey(null);
            if (hasOptions) setIsOpen(true);
          }}
        >
          <div className="flex items-start">
            <InputGroupAddon className="h-9.5 pl-[calc(1rem-1px)]">
              <SearchSpinner hasSearch={hasSearch} isSearching={isSearching} />
            </InputGroupAddon>

            {/* Each line as tall as the input, so the icon and the X keep the first line */}
            <div
              ref={rowRef}
              className={cn('flex min-w-0 grow items-center gap-x-1 *:data-[slot=chip]:my-1.75', isInUse ? 'flex-wrap' : 'overflow-hidden')}
            >
              {chips.map((chip, index) => (
                <FilterChip
                  key={chip.key}
                  chip={chip}
                  isPicking={chip.key === pickingKey}
                  onPress={hasAlternatives(chip) ? () => pressFilterChip(chip) : undefined}
                  className={cn('shrink-0', hiddenClass(index))}
                />
              ))}
              {words.map((text, index) =>
                wordEdit?.word === text ? (
                  <Chip
                    key={text}
                    onRemove={() => removeWord(text)}
                    removeLabel={t('c:remove_resource', { resource: text })}
                    className={cn('max-w-48', editingChipClass)}
                    // A press on its X leaves focus in the edit: losing it would save the edit, and its chip would go before the click lands
                    onMouseDown={(event) => {
                      if (event.target !== wordInputRef.current) event.preventDefault();
                    }}
                  >
                    <input
                      ref={wordInputRef}
                      aria-label={t('c:edit_resource', { resource: text })}
                      enterKeyHint="done"
                      size={Math.max(wordEdit.text.length, 1)}
                      value={wordEdit.text}
                      onChange={(event) => setWordEdit({ word: text, text: event.target.value })}
                      onKeyDown={handleWordKeyDown}
                      onBlur={handleWordBlur}
                      className="field-sizing-content max-w-full min-w-2 bg-transparent outline-hidden"
                    />
                  </Chip>
                ) : (
                  <WordChip
                    key={text}
                    text={text}
                    onPress={() => pressWordChip(text)}
                    onRemove={() => removeWord(text)}
                    className={cn('shrink-0', hiddenClass(chips.length + index))}
                  />
                ),
              )}
              {moreCount > 0 && <MoreChipsButton count={moreCount} onPress={() => inputRef.current?.focus()} />}

              <ComboboxPrimitive.Input
                ref={inputRef}
                render={<InputGroupInput className={cn('h-9.5 pl-0!', isInUse ? 'min-w-12' : 'min-w-0')} />}
                id={id}
                name={name}
                placeholder={hasChips ? undefined : label}
                aria-label={label}
                // Base UI reports an inline list as always expanded
                aria-expanded={isConnected}
                enterKeyHint="search"
                onFocus={() => {
                  if (hasOptions) setIsOpen(true);
                }}
                onKeyDown={handleKeyDown}
              />
            </div>

            <InputGroupAddon className="h-9.5 gap-0.5 py-0 pr-1.5 has-[>button]:mr-0" align="inline-end">
              {isCountInField && (
                <span role="status" className="text-muted-foreground mr-1 text-sm font-normal whitespace-nowrap tabular-nums">
                  {resultCount && countText(t, resultCount)}
                </span>
              )}
              {(!hideClear || isInUse) && (
                <SearchClearButton
                  aria-label={hasSearch ? t('c:clear_search') : t('c:close')}
                  className={cn(!hasSearch && !isInUse && 'invisible')}
                  onClick={clearOrClose}
                />
              )}
            </InputGroupAddon>
          </div>

          {isConnected && (
            <ComboboxList className="max-h-[min(24rem,60dvh)] border-t p-0 [--search-icon-start:1rem]">
              <SearchOptionsList
                {...{ pickingChip, pickingGroup, typingWord, groups, recents, hasChips }}
                // A count in the field is already in view above the rows
                resultCount={isCountInField ? undefined : resultCount}
                isResultPending={isSearching || search.isPending}
              />
            </ComboboxList>
          )}
        </ComboboxPrimitive.InputGroup>
      </Combobox>
    </div>
  );
}
