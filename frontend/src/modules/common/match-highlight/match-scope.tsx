import { createContext, type ReactNode, useContext } from 'react';
import { parseSearchQuery } from 'shared/utils/parse-search-query';

const MatchScopeContext = createContext<string[]>([]);

interface MatchScopeProps {
  terms: string[];
  children: ReactNode;
}

/** Provides the folded search terms (`parseTerms`) that `HighlightText` and `useMatchHighlight` paint below it; without one nothing is painted. */
export function MatchScope({ terms, children }: MatchScopeProps) {
  return <MatchScopeContext.Provider value={terms}>{children}</MatchScopeContext.Provider>;
}

export const useMatchScope = () => useContext(MatchScopeContext);

interface SearchScopeProps {
  /** A search query in the shared grammar: its terms are painted, its '-' terms never. */
  q?: string;
  children: ReactNode;
}

/** A `MatchScope` for a list's search query, around the list it filters. */
export function SearchScope({ q, children }: SearchScopeProps) {
  return <MatchScope terms={parseSearchQuery(q).terms}>{children}</MatchScope>;
}
