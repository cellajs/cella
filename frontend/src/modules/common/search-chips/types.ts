import type { ReactNode } from 'react';

export interface SearchChip {
  key: string;
  /** The filter this chip is a value of, and that value: pressing the chip offers the filter's other values. Without them a press does nothing. */
  group?: string;
  value?: string;
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
  /** Names the row for assistive technology; only a phone's search dialog shows it. */
  label: string;
  options: SearchOption[];
  onToggle: (value: string) => void;
  /** Swaps a selected value for another. A filter of one value can leave this out: its toggle already does that. */
  onReplace?: (from: string, to: string) => void;
  /** Smaller chips, for a row of many values such as labels. */
  isCompact?: boolean;
  /** Marks this filter's values among the typed suggestions, where a row's context is gone; its row of chips goes without. */
  matchIcon?: ReactNode;
  /** How many options the row shows; a selected one always shows, and typing finds the rest. */
  rowLimit?: number;
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

export interface SearchChipsFieldProps extends SearchFilters {
  /** The applied search words, such as the URL's `q`. */
  value: string;
  /** Receives the words once typing pauses, and at once when a chip goes. `typingWord` is the last of them while it is still being typed. */
  onSearch: (value: string, typingWord: string) => void;
  /** Clears the words and every filter. */
  onReset: () => void;
  /** Accessible name, and the placeholder. */
  label: string;
  name?: string;
  id?: string;
  /** What the search finds, as "4 tasks"; empty while nothing narrows the list. */
  count?: string;
  /** On a phone, a search button while no chip is active: the row has other content to keep. */
  compactOnPhone?: boolean;
  className?: string;
}

export type SearchSelection =
  | { kind: 'text' }
  | { kind: 'option'; group: SearchOptionGroup; option: SearchOption }
  | { kind: 'recent'; recent: SearchRecent };
