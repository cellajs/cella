import { createContext, type ReactNode, useContext } from 'react';

const MatchScopeContext = createContext<string[]>([]);

/**
 * The folded search terms (`parseTerms`) that `HighlightText` and `useMatchHighlight` paint below
 * this point. Without a scope nothing is painted.
 */
export function MatchScope({ terms, children }: { terms: string[]; children: ReactNode }) {
  return <MatchScopeContext.Provider value={terms}>{children}</MatchScopeContext.Provider>;
}

export const useMatchScope = () => useContext(MatchScopeContext);
