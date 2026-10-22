import { createContext, type ReactNode, useContext } from 'react';

const MatchScopeContext = createContext<string[]>([]);

interface MatchScopeProps {
  terms: string[];
  children: ReactNode;
}

/**
 * The folded search terms (`parseTerms`) that `HighlightText` and `useMatchHighlight` paint below
 * this point. Without a scope nothing is painted.
 */
export function MatchScope({ terms, children }: MatchScopeProps) {
  return <MatchScopeContext.Provider value={terms}>{children}</MatchScopeContext.Provider>;
}

export const useMatchScope = () => useContext(MatchScopeContext);
