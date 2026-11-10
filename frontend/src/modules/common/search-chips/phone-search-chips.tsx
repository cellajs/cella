import { SearchIcon } from 'lucide-react';
import { type CSSProperties, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ComboboxSearchInput } from '~/modules/common/combobox-search-input';
import { countText } from '~/modules/common/search-chips/count-text';
import { FilterChip, MoreChipsButton, WordChip } from '~/modules/common/search-chips/search-chip-items';
import { SearchOptionsList, searchComboboxProps } from '~/modules/common/search-chips/search-options';
import type { SearchChip, SearchChipsFieldProps, SearchSelection } from '~/modules/common/search-chips/types';
import { useChipPicking } from '~/modules/common/search-chips/use-chip-picking';
import { useFittingChips } from '~/modules/common/search-chips/use-fitting-chips';
import { useSearchWords } from '~/modules/common/search-chips/use-search-words';
import { SearchDialogBar, searchDialogLayout } from '~/modules/common/search-dialog-bar';
import { Button } from '~/modules/ui/button';
import { Combobox, ComboboxList } from '~/modules/ui/combobox';
import { Dialog, DialogContent, DialogTitle } from '~/modules/ui/dialog';
import { ScrollArea } from '~/modules/ui/scroll-area';
import { cn } from '~/utils/cn';
import { isTouchInteraction } from '~/utils/input-modality';

/** The field on a phone: its chips show while closed, and it opens as a dialog over the list, which a pick or the search key closes to show the results. */
export function PhoneSearchChips({
  value,
  onSearch,
  onReset,
  label,
  name,
  id,
  resultCount,
  isSearching,
  disabled,
  groups,
  chips,
  recents = [],
  onSearchEnd,
  compactOnPhone,
  edgeless,
  className,
}: SearchChipsFieldProps) {
  const { t } = useTranslation();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const highlightedRef = useRef<SearchSelection | undefined>(undefined);

  const search = useSearchWords({ value, onSearch });
  const { words, draft, typingWord, query } = search;
  const { pickingKey, setPickingKey, pickingChip, pickingGroup, hasAlternatives, applyOption } = useChipPicking(chips, groups);

  const [phase, setPhase] = useState<'closed' | 'open' | 'closing'>('closed');
  const [fieldRise, setFieldRise] = useState<string>();

  // The dialog's bar (h-12, under the safe area) starts and ends centered on the field or the icon button, so the field lifts to the top
  const riseFromField = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    return rect && `max(0px, calc(${rect.top + rect.height / 2}px - env(safe-area-inset-top) - 1.5rem))`;
  };

  const hasChips = chips.length > 0 || words.length > 0;
  const hasSearch = hasChips || !!typingWord;
  // The closed field shows as many chips as fit on its line and a count of the others
  const { moreCount, hiddenClass } = useFittingChips(rowRef, [...chips.map(({ key }) => key), ...words]);

  const open = (pickedChipKey: string | null = null) => {
    // Rendered within the tap, so the input takes focus inside the gesture: iOS opens its keyboard for no later focus
    flushSync(() => {
      setFieldRise(riseFromField());
      setPickingKey(pickedChipKey);
      setPhase('open');
    });
    if (!pickedChipKey) inputRef.current?.focus({ preventScroll: true });
  };

  // Measured again: the field may have replaced the icon button while the dialog was open
  const close = () => {
    setFieldRise(riseFromField());
    setPhase('closing');
  };

  // A render after the close, so the search it remembers holds what the pick or commit just changed
  useEffect(() => {
    if (phase !== 'closing') return;
    setPhase('closed');
    setPickingKey(null);
    onSearchEnd?.(query);
  }, [phase]);

  const pick = (selection: SearchSelection | null) => {
    if (!selection) return;
    if (selection.kind === 'text') search.commitDraft();
    else if (selection.kind === 'recent') selection.recent.onPick();
    else {
      applyOption(selection.group, selection.option);
      search.abandonDraft();
    }
    close();
  };

  const pressFilterChip = (chip: SearchChip) => {
    setPickingKey(chip.key === pickingKey ? null : chip.key);
    // A choice between chips needs no keyboard over it
    if (isTouchInteraction()) inputRef.current?.blur();
  };

  const pressWordChip = (text: string) => {
    setPickingKey(null);
    search.takeBackWord(text);
    inputRef.current?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !highlightedRef.current) {
      event.preventDefault();
      search.commitDraft();
      close();
    } else if (event.key === 'Backspace' && !draft) {
      // Else the key goes on to delete the word's last character
      if (search.takeBackLastWord()) event.preventDefault();
      else chips.at(-1)?.onRemove();
    }
  };

  return (
    <>
      {compactOnPhone && !hasChips ? (
        <Button
          ref={triggerRef}
          variant="outline"
          size="icon"
          aria-label={label}
          aria-haspopup="dialog"
          disabled={disabled}
          onClick={() => open()}
          className="shrink-0"
        >
          <SearchIcon />
        </Button>
      ) : (
        <div
          className={cn(
            'border-input relative flex h-10 min-w-0 grow items-center gap-2 rounded-md border pl-1.5',
            edgeless && 'edgeless',
            className,
          )}
        >
          <button
            ref={triggerRef}
            type="button"
            aria-label={label}
            aria-haspopup="dialog"
            disabled={disabled}
            onClick={() => open()}
            className="focus-effect absolute inset-0 rounded-md"
          />
          <SearchIcon className={cn('pointer-events-none size-5 shrink-0', !hasChips && 'opacity-50')} />
          {hasChips ? (
            <div ref={rowRef} className="pointer-events-none relative flex min-w-0 grow items-center gap-1.5">
              {chips.map((chip, index) => (
                <FilterChip
                  key={chip.key}
                  chip={chip}
                  size="lg"
                  onPress={hasAlternatives(chip) ? () => open(chip.key) : undefined}
                  className={cn('shrink-0', hiddenClass(index))}
                />
              ))}
              {words.map((text, index) => (
                <WordChip
                  key={text}
                  text={text}
                  size="lg"
                  onPress={() => {
                    search.takeBackWord(text);
                    open();
                  }}
                  onRemove={() => search.removeWord(text)}
                  className={cn('shrink-0', hiddenClass(chips.length + index))}
                />
              ))}
              {moreCount > 0 && <MoreChipsButton count={moreCount} size="lg" onPress={() => open()} className="pointer-events-auto" />}
            </div>
          ) : (
            <span className="text-faint-foreground pointer-events-none truncate">{label}</span>
          )}
        </div>
      )}

      <Dialog
        open={phase === 'open'}
        onOpenChange={(next) => {
          if (next) return;
          search.abandonDraft();
          close();
        }}
      >
        <DialogContent
          ref={popupRef}
          {...searchDialogLayout}
          className={cn(searchDialogLayout.className, 'p-0')}
          style={fieldRise ? ({ '--phone-rise': fieldRise } as CSSProperties) : undefined}
          initialFocus={() => (pickingKey ? popupRef.current : inputRef.current)}
          finalFocus={triggerRef}
        >
          <DialogTitle className="sr-only">{label}</DialogTitle>
          {/* Puts the icon where the closed field has it: the field's edge and its pl-1.5 */}
          <div className="flex min-h-0 flex-1 flex-col [--search-icon-size:1.25rem] [--search-icon-start:calc(0.875rem+1px)]">
            <Combobox<SearchSelection>
              {...searchComboboxProps}
              // The list is in the dialog while it shows; `open` tells Base UI so, for Enter to pick a highlighted row
              inline
              open={phase === 'open'}
              openOnInputClick={false}
              onValueChange={pick}
              inputValue={draft}
              onInputValueChange={(next, { reason, event }) => {
                // A pick writes the row's text into the input: only typing changes it
                if (reason !== 'input-change') return;
                search.typeInput(next, event);
                setPickingKey(null);
              }}
              onItemHighlighted={(item) => {
                highlightedRef.current = item;
              }}
              // On touch the keyboard's search key would pick a highlighted first row nobody chose
              autoHighlight={!isTouchInteraction()}
            >
              <SearchDialogBar
                hasSearch={hasSearch}
                onClear={() => {
                  onSearchEnd?.(query);
                  setPickingKey(null);
                  search.clearWords();
                  onReset();
                }}
              >
                <ComboboxSearchInput
                  ref={inputRef}
                  {...{ id, name, hasSearch, isSearching }}
                  aria-label={label}
                  placeholder={label}
                  enterKeyHint="search"
                  value={draft}
                  onKeyDown={handleKeyDown}
                  className="h-12 text-base"
                  // text-lg sizes the search icon
                  wrapClassName="h-12 min-w-0 flex-1 border-b-0 pl-(--search-icon-start) text-lg"
                />
                {/* The modal dialog hides the bar's own count */}
                <span role="status" className="sr-only">
                  {resultCount && countText(t, resultCount, { found: true })}
                </span>
              </SearchDialogBar>

              {hasChips && (
                <div className="flex flex-wrap gap-1.5 border-b py-2 pr-2 pl-(--search-icon-start)">
                  {chips.map((chip) => (
                    <FilterChip
                      key={chip.key}
                      chip={chip}
                      size="lg"
                      isPicking={chip.key === pickingKey}
                      onPress={hasAlternatives(chip) ? () => pressFilterChip(chip) : undefined}
                    />
                  ))}
                  {words.map((text) => (
                    <WordChip key={text} text={text} size="lg" onPress={() => pressWordChip(text)} onRemove={() => search.removeWord(text)} />
                  ))}
                </div>
              )}

              <ScrollArea
                className="flex min-h-0 flex-1 flex-col"
                viewportClassName="min-h-0 overscroll-none pb-[env(safe-area-inset-bottom)]"
                // Scrolling means reading what is below the keyboard
                onTouchMove={() => inputRef.current?.blur()}
              >
                <ComboboxList className="h-full max-h-none overflow-visible p-0">
                  <SearchOptionsList
                    {...{ pickingChip, pickingGroup, typingWord, groups, recents, hasChips, resultCount }}
                    isResultPending={isSearching || search.isPending}
                  />
                </ComboboxList>
              </ScrollArea>
            </Combobox>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
