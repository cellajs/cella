import { createContext, type ReactNode, useContext } from 'react';

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
