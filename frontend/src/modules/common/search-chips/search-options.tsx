import { HistoryIcon, SearchIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { foldText, matchesTerms } from 'shared/utils/text-match';
import { HighlightText } from '~/modules/common/match-highlight/highlight-text';
import { MatchScope } from '~/modules/common/match-highlight/match-scope';
import { countText } from '~/modules/common/search-chips/count-text';
import type { ResultCount, SearchChip, SearchOption, SearchOptionGroup, SearchRecent, SearchSelection } from '~/modules/common/search-chips/types';
import { SearchRecentRemoveButton } from '~/modules/common/search-clear-button';
import { SearchRowIcon } from '~/modules/common/search-row-icon';
import { Spinner } from '~/modules/common/spinner';
import { Chip } from '~/modules/ui/chip';
import { ComboboxGroup, ComboboxGroupLabel, ComboboxItem, ComboboxSeparator } from '~/modules/ui/combobox';
import { Kbd } from '~/modules/ui/kbd';
import { cn } from '~/utils/cn';

/** What the options of a chips field share on its combobox: nothing stays selected, and each list does its own matching. */
export const searchComboboxProps = { value: null, filter: () => true, itemToStringLabel: () => '' };

// The field sets --search-icon-start, measured from the list's edge: its p-1 is already part of that
const suggestionRowClass = 'pl-[calc(var(--search-icon-start)-0.25rem)]';

/** The count at a row's end, or a spinner while the search it counts is still on its way. */
function RowCount({ text, isPending }: { text: string; isPending: boolean }) {
  if (isPending) return <Spinner size="sm" className="size-3.5" />;
  return <span className="text-muted-foreground text-xs tabular-nums">{text}</span>;
}

const selectedFirst = (options: SearchOption[]) => [...options].sort((a, b) => Number(b.isSelected) - Number(a.isSelected));

/** A filter under its heading, its values wrapping onto as many lines as they need. */
function SearchOptionRow({ group }: { group: SearchOptionGroup }) {
  // A row with a limit puts its selected values first as it opens and keeps that order, as a pick also changes the counts it sorts by
  const [openOrder] = useState(() => new Map(selectedFirst(group.options).map(({ value }, index) => [value, index])));
  const rank = ({ value }: SearchOption) => openOrder.get(value) ?? openOrder.size;
  const options =
    group.rowLimit === undefined
      ? group.options
      : [...group.options].sort((a, b) => rank(a) - rank(b)).filter((option, index) => index < (group.rowLimit ?? 0) || option.isSelected);

  return (
    <ComboboxGroup
      aria-label={group.isUnlabeled ? group.label : undefined}
      data-unlabeled={group.isUnlabeled || undefined}
      className="[[data-unlabeled]+&]:border-t [[data-unlabeled]+&]:border-dashed"
    >
      {!group.isUnlabeled && (
        <ComboboxGroupLabel className="px-(--search-icon-start) pt-2 pb-0 pointer-coarse:px-(--search-icon-start) pointer-coarse:pb-0">
          {group.label}
        </ComboboxGroupLabel>
      )}
      <div className={cn('flex flex-wrap gap-1 px-(--search-icon-start)', group.isUnlabeled ? 'py-2' : 'py-1.5')}>
        {options.map((option) => (
          <ComboboxItem
            key={option.value}
            value={{ kind: 'option', group, option } satisfies SearchSelection}
            aria-selected={option.isSelected}
            title={group.isIconOnly ? option.label : undefined}
            className={cn(
              // The input's chips put gap-1 between icon and label; the count keeps its distance with ml-1
              'border-input w-auto shrink-0 gap-1 rounded-full border px-2.5 py-0',
              group.isIconOnly
                ? 'h-7.5 gap-1.5 pl-0 *:first:size-7 pointer-coarse:h-8.5 pointer-coarse:pl-0.75'
                : group.isCompact
                  ? 'h-6.5 pointer-coarse:h-8.5'
                  : 'h-7.5 max-sm:h-6.5 max-sm:px-2 pointer-coarse:h-8.5 max-sm:pointer-coarse:h-8.5',
              (group.isCompact || group.isIconOnly) &&
                !option.isSelected &&
                'hover:border-input active:border-input data-highlighted:border-input border-transparent',
              option.count === 0 && !option.isSelected && 'text-muted-foreground border-dashed',
              option.isSelected &&
                'more-contrast:border-foreground bg-foreground/12 active:bg-foreground/18 data-highlighted:bg-foreground/18 border-transparent',
            )}
          >
            {option.icon}
            {group.isIconOnly ? <span className="sr-only">{option.label}</span> : option.label}
            {option.count !== undefined && (
              <span className={cn('text-muted-foreground text-xs tabular-nums', !group.isIconOnly && 'ml-1')}>{option.count}</span>
            )}
          </ComboboxItem>
        ))}
      </div>
    </ComboboxGroup>
  );
}

function SearchRecentItem({ recent }: { recent: SearchRecent }) {
  return (
    <ComboboxItem
      value={{ kind: 'recent', recent } satisfies SearchSelection}
      className={cn('group/recent justify-between pr-1', suggestionRowClass)}
    >
      <div className="flex min-w-0 items-center gap-2">
        <SearchRowIcon>
          <HistoryIcon className="text-muted-foreground" />
        </SearchRowIcon>
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
      {/* The margin puts this X under the field's */}
      <SearchRecentRemoveButton className="mr-px" onRemove={recent.onRemove} />
    </ComboboxItem>
  );
}

interface SearchSuggestionsProps {
  word: string;
  groups: SearchOptionGroup[];
  recents: SearchRecent[];
  result?: string;
  isResultPending: boolean;
}

function SearchSuggestions({ word, groups, recents, result, isResultPending }: SearchSuggestionsProps) {
  const { t } = useTranslation();
  const terms = [foldText(word)];

  const optionMatches = groups.flatMap((group) =>
    group.options.filter((option) => matchesTerms([foldText(option.label)], terms)).map((option) => ({ group, option })),
  );
  const recentMatches = recents.filter((recent) => matchesTerms([foldText(recent.text)], terms) && foldText(recent.text) !== terms[0]).slice(0, 2);

  return (
    <div className="p-1">
      <ComboboxItem value={{ kind: 'text' } satisfies SearchSelection} className={suggestionRowClass}>
        <SearchRowIcon>
          <SearchIcon className="text-muted-foreground" />
        </SearchRowIcon>
        <span className="truncate">{t('c:search_for', { query: word })}</span>
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {result !== undefined && <RowCount text={result} isPending={isResultPending} />}
          <Kbd className="max-sm:hidden">Enter</Kbd>
        </span>
      </ComboboxItem>
      <MatchScope terms={terms}>
        {optionMatches.length > 0 && <ComboboxSeparator />}
        {optionMatches.map(({ group, option }) => (
          <ComboboxItem
            key={`${group.key}:${option.value}`}
            value={{ kind: 'option', group, option } satisfies SearchSelection}
            className={suggestionRowClass}
          >
            <SearchRowIcon>{option.icon ?? group.matchIcon}</SearchRowIcon>
            <span className="truncate">
              <HighlightText text={option.label} />
            </span>
            {option.count !== undefined && <span className="text-muted-foreground ml-auto text-xs tabular-nums">{option.count}</span>}
          </ComboboxItem>
        ))}
        {recentMatches.length > 0 && <ComboboxSeparator />}
        {recentMatches.map((recent) => (
          <ComboboxItem key={recent.key} value={{ kind: 'recent', recent } satisfies SearchSelection} className={suggestionRowClass}>
            <SearchRowIcon>
              <HistoryIcon className="text-muted-foreground" />
            </SearchRowIcon>
            <span className="truncate">
              <HighlightText text={recent.text} />
            </span>
          </ComboboxItem>
        ))}
      </MatchScope>
    </div>
  );
}

interface SearchOptionsListProps {
  pickingChip?: SearchChip;
  pickingGroup?: SearchOptionGroup;
  typingWord: string;
  groups: SearchOptionGroup[];
  recents: SearchRecent[];
  /** Hides the latest recent search, which typing still finds. */
  hasChips: boolean;
  resultCount?: ResultCount;
  /** The count is for an earlier search. */
  isResultPending: boolean;
}

/** What a chips field offers: a pressed chip's alternatives, what a typed word suggests, or every filter and the recent searches. */
export function SearchOptionsList({
  pickingChip,
  pickingGroup,
  typingWord,
  groups,
  recents,
  hasChips,
  resultCount,
  isResultPending,
}: SearchOptionsListProps) {
  const { t } = useTranslation();

  if (pickingChip && pickingGroup) {
    const label = t('c:change_resource_to', { resource: pickingChip.label });
    return (
      <SearchOptionRow group={{ ...pickingGroup, label, isUnlabeled: false, options: pickingGroup.options.filter((option) => !option.isSelected) }} />
    );
  }

  if (typingWord) {
    const result = resultCount && countText(t, resultCount, { found: true });
    return <SearchSuggestions word={typingWord} groups={groups} recents={recents} result={result} isResultPending={isResultPending} />;
  }

  const latestRecent = recents.at(0);

  return (
    <>
      {latestRecent && !hasChips && (
        <ComboboxGroup aria-label={t('c:history')} className="border-b p-1 last:border-b-0">
          <SearchRecentItem recent={latestRecent} />
        </ComboboxGroup>
      )}
      {groups.map((group) => (
        <SearchOptionRow key={group.key} group={group} />
      ))}
    </>
  );
}
