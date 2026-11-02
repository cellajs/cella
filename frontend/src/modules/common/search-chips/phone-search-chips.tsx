import { SearchIcon } from 'lucide-react';
import { type KeyboardEvent, type RefObject, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ComboboxSearchInput } from '~/modules/common/combobox-search-input';
import { FilterChip, WordChip } from '~/modules/common/search-chips/search-chip-items';
import { flySearchDialog } from '~/modules/common/search-chips/search-dialog-flight';
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

interface ClosedSearchFieldProps {
  fieldRef: RefObject<HTMLDivElement | null>;
  triggerRef: RefObject<HTMLButtonElement | null>;
  label: string;
  chips: SearchChip[];
  words: string[];
  chipKeys: string;
  hasAlternatives: (chip: SearchChip) => boolean;
  onOpen: (pickedChipKey?: string) => void;
  onPressWord: (word: string) => void;
  onRemoveWord: (word: string) => void;
  className?: string;
}

/** The closed field: as many chips as fit on its line and a count of the others, over a trigger that opens the dialog. */
function ClosedSearchField({
  fieldRef,
  triggerRef,
  label,
  chips,
  words,
  chipKeys,
  hasAlternatives,
  onOpen,
  onPressWord,
  onRemoveWord,
  className,
}: ClosedSearchFieldProps) {
  const { t } = useTranslation();
  const rowRef = useRef<HTMLDivElement>(null);

  const chipCount = chips.length + words.length;
  const fitting = useFittingChips(rowRef, chipKeys);
  const moreCount = Math.max(chipCount - fitting, 0);
  const hiddenClass = (index: number) => index >= fitting && 'invisible absolute';

  return (
    <div ref={fieldRef} className={cn('relative flex h-10 min-w-0 grow items-center gap-2 rounded-md border border-input pl-1.5', className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        onClick={() => onOpen()}
        className="focus-effect absolute inset-0 rounded-md"
      />
      <SearchIcon className={cn('pointer-events-none size-5 shrink-0', chipCount === 0 && 'opacity-50')} />
      {chipCount === 0 ? (
        <span className="pointer-events-none truncate text-faint-foreground">{label}</span>
      ) : (
        <div ref={rowRef} className="pointer-events-none relative flex min-w-0 grow items-center gap-1.5">
          {chips.map((chip, index) => (
            <FilterChip
              key={chip.key}
              chip={chip}
              size="lg"
              onPress={hasAlternatives(chip) ? () => onOpen(chip.key) : undefined}
              className={cn('shrink-0', hiddenClass(index))}
            />
          ))}
          {words.map((text, index) => (
            <WordChip
              key={text}
              text={text}
              size="lg"
              onPress={() => onPressWord(text)}
              onRemove={() => onRemoveWord(text)}
              className={cn('shrink-0', hiddenClass(chips.length + index))}
            />
          ))}
          {moreCount > 0 && (
            <Button
              variant="secondary"
              size="xs"
              aria-label={t('c:counted_more', { count: moreCount })}
              onClick={() => onOpen()}
              className="pointer-events-auto h-7 w-9 shrink-0 rounded-full px-0 tabular-nums"
            >
              +{moreCount}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** The field on a phone: its chips show while closed, and it opens as a dialog over the list, which a pick or the search key closes to show the results. */
export function PhoneSearchChips({
  value,
  onSearch,
  label,
  name,
  id,
  count = '',
  groups,
  chips,
  recents = [],
  onSearchEnd,
  compactOnPhone,
  className,
}: SearchChipsFieldProps) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const highlightedRef = useRef<SearchSelection | undefined>(undefined);

  const search = useSearchWords({ value, onSearch });
  const { words, draft, typingWord, query } = search;
  const { pickingKey, setPickingKey, pickingChip, pickingGroup, hasAlternatives, applyOption } = useChipPicking(chips, groups);

  const [phase, setPhase] = useState<'closed' | 'open' | 'closing'>('closed');

  const hasChips = chips.length > 0 || words.length > 0;
  const chipKeys = [...chips.map(({ key }) => key), ...words].join();

  const open = (pickedChipKey: string | null = null) => {
    // Rendered within the tap, so the input takes focus inside the gesture: iOS opens its keyboard for no later focus
    flushSync(() => {
      setPickingKey(pickedChipKey);
      setPhase('open');
    });
    if (!pickedChipKey) inputRef.current?.focus({ preventScroll: true });
    if (popupRef.current && fieldRef.current) flySearchDialog(popupRef.current, fieldRef.current, 'normal');
  };

  // Runs again when a pick's chip arrives, so the flight ends where that chip put the others. A frame later: the list's scroll reset can still move the field
  useEffect(() => {
    if (phase !== 'closing') return;
    let flight: ReturnType<typeof flySearchDialog> | undefined;
    let hasLanded = false;
    const frame = requestAnimationFrame(() => {
      if (!popupRef.current || !fieldRef.current) return;
      flight = flySearchDialog(popupRef.current, fieldRef.current, 'reverse');
      flight.finished.then(
        () => {
          hasLanded = true;
          setPhase('closed');
          setPickingKey(null);
          onSearchEnd?.(query);
        },
        () => {},
      );
    });
    return () => {
      cancelAnimationFrame(frame);
      // A landed flight keeps the dialog clipped to the field: cancelled, the whole dialog shows again until it unmounts
      if (!hasLanded) flight?.cancel();
    };
  }, [phase, chipKeys]);

  const pick = (selection: SearchSelection | null) => {
    if (!selection) return;
    if (selection.kind === 'text') search.commitDraft();
    else if (selection.kind === 'recent') selection.recent.onPick();
    else {
      applyOption(selection.group, selection.option);
      search.abandonDraft();
    }
    setPhase('closing');
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
      setPhase('closing');
    } else if (event.key === 'Backspace' && !draft) {
      // Else the key goes on to delete the word's last character
      if (search.takeBackLastWord()) event.preventDefault();
      else chips.at(-1)?.onRemove();
    }
  };

  return (
    <>
      {compactOnPhone && !hasChips ? (
        <div ref={fieldRef} className="shrink-0">
          <Button ref={triggerRef} variant="outline" size="icon" aria-label={label} aria-haspopup="dialog" onClick={() => open()}>
            <SearchIcon />
          </Button>
        </div>
      ) : (
        <ClosedSearchField
          fieldRef={fieldRef}
          triggerRef={triggerRef}
          label={label}
          chips={chips}
          words={words}
          chipKeys={chipKeys}
          hasAlternatives={hasAlternatives}
          onOpen={open}
          onPressWord={(text) => {
            search.takeBackWord(text);
            open();
          }}
          onRemoveWord={search.removeWord}
          className={className}
        />
      )}

      <Dialog
        open={phase !== 'closed'}
        onOpenChange={(next) => {
          if (next) return;
          search.abandonDraft();
          setPhase('closing');
        }}
      >
        <DialogContent
          ref={popupRef}
          {...searchDialogLayout}
          className={cn(searchDialogLayout.className, 'p-0 data-closed:animate-none! data-open:animate-none!')}
          initialFocus={() => (pickingKey ? popupRef.current : inputRef.current)}
          finalFocus={triggerRef}
        >
          <DialogTitle className="sr-only">{label}</DialogTitle>
          {/* Puts the icon where the closed field has it: the list's gutter, the field's edge and its pl-1.5 */}
          <div className="flex min-h-0 flex-1 flex-col [--search-icon-size:1.25rem] [--search-icon-start:calc(0.875rem+1px)]">
            <Combobox<SearchSelection>
              {...searchComboboxProps}
              inline
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
              <SearchDialogBar>
                <ComboboxSearchInput
                  ref={inputRef}
                  id={id}
                  name={name}
                  aria-label={label}
                  placeholder={label}
                  enterKeyHint="search"
                  value={draft}
                  hasSearch={hasChips || !!draft}
                  onClear={search.dropDraft}
                  onKeyDown={handleKeyDown}
                  className="h-12 text-base"
                  // text-lg sizes the search icon
                  wrapClassName="h-12 min-w-0 flex-1 border-b-0 pl-(--search-icon-start) text-lg"
                  // The closed field's own label stays put in this one; anything else it shows flies off, so the input fades in
                  data-flight-fade={hasChips || compactOnPhone || undefined}
                />
                {/* Mounted while empty too: a status region announces changes only once it exists */}
                <span role="status" className="mr-2 whitespace-nowrap text-muted-foreground text-sm tabular-nums">
                  {count}
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
                viewportClassName="min-h-0 overscroll-contain pb-[env(safe-area-inset-bottom)]"
                // Scrolling means reading what is below the keyboard
                onTouchMove={() => inputRef.current?.blur()}
                data-flight-fade
              >
                <ComboboxList className="h-full max-h-none overflow-visible p-0">
                  <SearchOptionsList
                    pickingChip={pickingChip}
                    pickingGroup={pickingGroup}
                    typingWord={typingWord}
                    groups={groups}
                    recents={recents}
                    hasChips={hasChips}
                    isWrapped
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
