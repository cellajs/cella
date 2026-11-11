import type { ReactNode } from 'react';
import type { TKey } from '~/lib/i18n-locales';

export interface SearchChip {
  key: string;
  /** The filter this chip is a value of, and that value: pressing the chip offers the filter's other values. Without them a press does nothing. */
  group?: string;
  value?: string;
  label: string;
  icon?: ReactNode;
  /** Media on the chip's start edge, such as a person's avatar, in place of an icon; the chip sizes it to its height. */
  start?: ReactNode;
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
  /** The heading over the filter's values, or only their accessible name when unlabeled. */
  label: string;
  options: SearchOption[];
  onToggle: (value: string) => void;
  /**
   * Swaps a selected value for another, for a filter that holds several. A filter of one value leaves this out: its toggle
   * already swaps. It also marks how many values the filter takes, which decides whether the options stay open after a pick.
   */
  onReplace?: (from: string, to: string) => void;
  /** Smaller chips, for a row of many values such as labels. */
  isCompact?: boolean;
  /** Its row shows each value by its icon alone, raised to avatar size, such as people; the label still names it to typing, a hover and assistive technology. */
  isIconOnly?: boolean;
  /** Marks this filter's values among the typed suggestions, where a row's context is gone; its row of chips goes without. */
  matchIcon?: ReactNode;
  /** How many options the row shows; a selected one always shows, and typing finds the rest. */
  rowLimit?: number;
  /** Its row goes without a heading, split from an unlabeled row above by a dashed line. A pressed chip's alternatives keep theirs. */
  isUnlabeled?: boolean;
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

export interface ResultCount {
  count: number;
  /** The counted noun's label, pluralized by the count. */
  resource: TKey;
}

export interface SearchChipsFieldProps extends SearchFilters {
  /** The applied search words, such as the URL's `q`. */
  value: string;
  /** Receives the words once typing pauses, and at once when a chip goes. `typingWord` is the last of them while it is still being typed. */
  onSearch: (value: string, typingWord: string) => void;
  /** Clears the words and every filter. */
  onReset: () => void;
  /** Accessible name, and the placeholder. */
  label: string;
  /** The phone dialog's name and placeholder, for one that can say more than the closed field, such as what it searches; else the label. */
  dialogLabel?: string;
  name?: string;
  id?: string;
  /** What the search finds, or the whole list while nothing narrows it, for the typed word's row; left out where the bar shows it. */
  resultCount?: ResultCount;
  /** Also shows the count at the field's end, for a search that fills its bar. */
  isCountInField?: boolean;
  /** A search on its way: the spinner takes the search icon's place. */
  isSearching?: boolean;
  /** Locks the field, such as offline for a list the server searches. */
  disabled?: boolean;
  /** Leaves out the X at rest, for a field whose bar clears the search; in use it shows, since the options cover that bar. */
  hideClear?: boolean;
  /** On a phone, a search button while no chip is active: the row has other content to keep. */
  compactOnPhone?: boolean;
  /** Draws no edge at rest, for a field its bar frames; its options keep their own edges. */
  edgeless?: boolean;
  /** For the field's root: its width in the bar. */
  className?: string;
}

export type SearchSelection =
  | { kind: 'text' }
  | { kind: 'option'; group: SearchOptionGroup; option: SearchOption }
  | { kind: 'recent'; recent: SearchRecent };
