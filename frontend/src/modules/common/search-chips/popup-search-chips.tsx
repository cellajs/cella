import { SearchIcon } from 'lucide-react';
import { type FocusEvent, type KeyboardEvent, type MouseEvent, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { FilterChip, WordChip } from '~/modules/common/search-chips/search-chip-items';
import { SearchOptionsList, searchComboboxProps } from '~/modules/common/search-chips/search-options';
import type { SearchChip, SearchChipsFieldProps, SearchSelection } from '~/modules/common/search-chips/types';
import { useChipPicking } from '~/modules/common/search-chips/use-chip-picking';
import { useSearchWords, type WordEdit } from '~/modules/common/search-chips/use-search-words';
import { SearchClearButton } from '~/modules/common/search-clear-button';
import { Chip } from '~/modules/ui/chip';
import { Combobox, ComboboxContent, ComboboxList, ComboboxPrimitive } from '~/modules/ui/combobox';
import { InputGroup, InputGroupAddon, InputGroupInput } from '~/modules/ui/input-group';
import { cn } from '~/utils/cn';
import { isTouchInteraction } from '~/utils/input-modality';
import { tw } from '~/utils/tw';

const closingReasons = new Set(['outside-press', 'escape-key', 'focus-out']);

const editingChipClass = 'border-foreground-soft bg-background pr-0.5 pl-2.5';

// While open the field and its options are one shape: one frame around both, the field's bottom edge the only line between them.
const connectedShadowClass = tw(
  'shadow-[0_8px_24px_-4px_rgb(0_0_0/0.16),0_24px_48px_-12px_rgb(0_0_0/0.2)] dark:shadow-[0_12px_32px_rgb(0_0_0/0.6),0_32px_64px_rgb(0_0_0/0.55)]',
);
const connectedFieldClass = tw(
  'rounded-b-none border-transparent border-b-border ring-2 ring-ring focus-ring:has-[[data-slot=input-group-control]:focus-visible]:ring-offset-0 dark:bg-card',
);
// The clip cuts the popup's frame and shadow where it meets the field. The popup only fades: a zoom or slide would pull it off the field.
const connectedPopupClass = tw(
  'data-[side=bottom]:slide-in-from-top-0! data-closed:zoom-out-100! data-open:zoom-in-100! rounded-t-none ring-2 ring-ring [clip-path:inset(0_-100px_-100px_-100px)] dark:bg-card',
);

/** The field from `sm` up: chips and input in the field, options in a popup that stays open for more picks until touch ends the search. */
export function PopupSearchChips({
  value,
  onSearch,
  onReset,
  label,
  name,
  id,
  count = '',
  groups,
  chips,
  recents = [],
  onSearchEnd,
  className,
}: SearchChipsFieldProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const highlightedRef = useRef<SearchSelection | undefined>(undefined);
  const wordInputRef = useRef<HTMLInputElement>(null);

  const [wordEdit, setWordEdit] = useState<WordEdit | null>(null);
  const search = useSearchWords({ value, onSearch, wordEdit });
  const { words, draft, typingWord, query } = search;
  const { pickingKey, setPickingKey, pickingChip, pickingGroup, hasAlternatives, applyOption } = useChipPicking(chips, groups);

  const [isOpen, setIsOpen] = useState(false);

  // A chip can go from under its edit, such as by a reset, a recent search or the back button
  if (wordEdit && !words.includes(wordEdit.word)) setWordEdit(null);

  const isTyping = isOpen && !!typingWord;
  const hasOptions = groups.length > 0 || recents.length > 0;
  const isConnected = isOpen && hasOptions;
  const hasChips = chips.length > 0 || words.length > 0;
  const hasSearch = hasChips || !!typingWord;

  const close = () => {
    setPickingKey(null);
    setIsOpen(false);
    onSearchEnd?.(search.commitDraft());
  };

  // Touch ends the search on a pick. Flushed so the input's blur sees the options closed, and remembers this search
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

  const clearOrClose = ({ currentTarget }: MouseEvent<HTMLButtonElement>) => {
    if (!hasSearch) {
      setIsOpen(false);
      return inputRef.current?.blur();
    }
    onSearchEnd?.(query);
    const wasEditing = !!wordEdit;
    endWordEdit(false);
    search.clearWords();
    onReset();
    // Only a keyboard gets the X focused, and clearing hides it; a mouse press leaves focus and the options as they are
    if (wasEditing || document.activeElement === currentTarget) inputRef.current?.focus();
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
    if (selection.kind === 'text') return close();
    if (selection.kind === 'recent') {
      selection.recent.onPick();
      return setIsOpen(false);
    }
    applyOption(selection.group, selection.option);
    if (pickingChip) {
      setPickingKey(null);
      return endOnTouch();
    }
    // A suggestion replaces the word that found it; a chip leaves the options open to pick more
    if (isTyping) {
      search.abandonDraft();
      setIsOpen(false);
    } else endOnTouch();
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
    } else if (event.key === 'Escape' && draft) {
      event.preventBaseUIHandler();
      search.abandonDraft();
    } else if (event.key === 'Escape' && !isOpen) {
      event.currentTarget.blur();
    } else if (event.key === 'Backspace' && !draft) {
      // Else the key goes on to delete the word's last character
      if (search.takeBackLastWord()) event.preventDefault();
      else chips.at(-1)?.onRemove();
    }
  };

  return (
    <div ref={fieldRef} className={cn('flex min-w-0 grow flex-col gap-1', className)}>
      <Combobox<SearchSelection>
        {...searchComboboxProps}
        onValueChange={pick}
        inputValue={draft}
        onInputValueChange={(next, { reason, event }) => {
          // A pick writes the row's text into the input: only typing changes it
          if (reason === 'input-change') handleInputChange(next, event);
        }}
        open={isOpen && hasOptions}
        onOpenChange={(next, { reason }) => {
          if (next) setIsOpen(true);
          else if (reason === 'escape-key' && pickingChip) setPickingKey(null);
          else if (closingReasons.has(reason)) close();
        }}
        onItemHighlighted={(item) => {
          highlightedRef.current = item;
        }}
      >
        <ComboboxPrimitive.InputGroup
          ref={groupRef}
          render={
            <InputGroup
              className={cn(
                'h-auto min-h-10 flex-wrap transition-[color,box-shadow,border-radius] duration-100',
                isConnected && [connectedFieldClass, connectedShadowClass],
              )}
            />
          }
          onClick={({ target }) => {
            if (target instanceof Element && !target.closest('button')) setPickingKey(null);
          }}
        >
          <InputGroupAddon className="pl-[calc(1rem-1px)]">
            <SearchIcon className={cn('mr-2 size-4', !hasSearch && 'opacity-50')} />
          </InputGroupAddon>

          {hasChips && (
            <div className="flex flex-wrap items-center gap-1 py-1 pr-1">
              {chips.map((chip) => (
                <FilterChip
                  key={chip.key}
                  chip={chip}
                  isPicking={chip.key === pickingKey}
                  onPress={hasAlternatives(chip) ? () => pressFilterChip(chip) : undefined}
                />
              ))}
              {words.map((text) =>
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
                      className="field-sizing-content min-w-2 max-w-full bg-transparent outline-hidden"
                    />
                  </Chip>
                ) : (
                  <WordChip key={text} text={text} onPress={() => pressWordChip(text)} onRemove={() => removeWord(text)} />
                ),
              )}
            </div>
          )}

          <ComboboxPrimitive.Input
            ref={inputRef}
            render={<InputGroupInput className="min-w-24 pl-0!" />}
            id={id}
            name={name}
            placeholder={hasChips ? undefined : label}
            aria-label={label}
            enterKeyHint="search"
            onFocus={() => {
              if (hasOptions) setIsOpen(true);
            }}
            // A suggestion closes the options before focus leaves, so this ends that search
            onBlur={() => {
              if (!isOpen && !wordEdit) onSearchEnd?.(query);
            }}
            onKeyDown={handleKeyDown}
          />

          <InputGroupAddon className="gap-0.5 pr-1.5 has-[>button]:mr-0" align="inline-end">
            {/* Mounted while empty too: a status region announces changes only once it exists */}
            <span role="status" className="mr-1 whitespace-nowrap font-normal text-muted-foreground text-sm tabular-nums">
              {count}
            </span>
            <SearchClearButton
              aria-label={hasSearch ? t('c:clear_search') : t('c:close')}
              className={cn(!hasSearch && !isOpen && 'invisible')}
              // Out of the tab order with nothing to clear: Tab closes the options, and that would hide the X it landed on
              tabIndex={hasSearch ? undefined : -1}
              onClick={clearOrClose}
            />
          </InputGroupAddon>
        </ComboboxPrimitive.InputGroup>

        <ComboboxContent
          anchor={groupRef}
          sideOffset={0}
          className={cn('min-w-80 max-w-(--available-width)', connectedPopupClass, connectedShadowClass)}
        >
          {/* Where the rows have their icon; the field's addon puts its own there too */}
          <ComboboxList className="p-0 [--search-icon-start:1rem]">
            <SearchOptionsList
              pickingChip={pickingChip}
              pickingGroup={pickingGroup}
              typingWord={isTyping ? typingWord : ''}
              groups={groups}
              recents={recents}
              hasChips={hasChips}
            />
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  );
}
