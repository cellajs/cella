import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { SearchIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDebounce } from '~/hooks/use-debounce';
import { useFocusByRef } from '~/hooks/use-focus-by-ref';
import { scrollToSectionById } from '~/hooks/use-scroll-spy-store';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { type HistoryEntry, SearchHistoryGroup } from '~/modules/common/search-history-group';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { getDocsSearchClient } from '~/modules/docs/search/client';
import { DocsSearchRow } from '~/modules/docs/search/docs-search-row';
import { deleteRecentSearch, updateRecentSearches, useDocsSearchStore } from '~/modules/docs/search/docs-search-store';
import type { DocsSearchResult, DocsSearchScope } from '~/modules/docs/search/types';
import { docsConfig } from '~/modules/page/content';
import { Combobox, ComboboxItem, ComboboxList, ComboboxSearchInput } from '~/modules/ui/combobox';
import { ScrollArea } from '~/modules/ui/scroll-area';
import { cn } from '~/utils/cn';
import { resolveSearchInput } from '~/utils/recent-searches';

type SearchSelection = DocsSearchResult | HistoryEntry;

/** Scope chips, labeled by the config-driven sidebar section labels. */
const scopeChips: { value: DocsSearchScope; label: string }[] = [
  { value: 'pages', label: docsConfig.sections.find((s) => s.id === 'pages')?.label ?? 'Documentation' },
  { value: 'api', label: docsConfig.sections.find((s) => s.id === 'apiReference')?.label ?? 'API' },
];

/** Docs search dialog: client-side search over docs pages and the API reference, works offline. */
export function DocsSearch() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { focusRef } = useFocusByRef();

  const [searchValue, setSearchValue] = useState('');
  const debouncedValue = useDebounce(searchValue, 100, { immediateValue: '' });
  const [scope, setScope] = useState<DocsSearchScope>('all');
  const recentSearches = useDocsSearchStore((state) => state.recentSearches);

  // null = blank query (default links); previous results stay visible while a new search runs
  const [results, setResults] = useState<DocsSearchResult[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Warm the engine on open so the first keystroke does not wait on the Orama import and corpus build
  useEffect(() => {
    getDocsSearchClient(queryClient).catch(() => {});
  }, [queryClient]);

  useEffect(() => {
    const term = debouncedValue.trim();
    if (!term) {
      setResults(null);
      setIsSearching(false);
      return;
    }
    let cancelled = false;
    setIsSearching(true);
    getDocsSearchClient(queryClient)
      .then((client) => client.search(term, scope))
      .then((found) => {
        if (!cancelled) setResults(found);
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      })
      .finally(() => {
        if (!cancelled) setIsSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedValue, scope, queryClient]);

  const close = () => {
    useDialoger.getState().remove('docs-search');
    // On mobile, search opens from the sidebar sheet; close that too.
    useSheeter.getState().remove('docs-sidebar');
  };

  const onSelect = (selection: SearchSelection) => {
    // History entries re-run their query without navigating.
    if ('kind' in selection) {
      setSearchValue(selection.value);
      return;
    }
    updateRecentSearches(searchValue);
    navigate({ to: selection.to, params: selection.params, hash: selection.hash, resetScroll: false });
    // Queued scroll: resolves once the target section is mounted and laid out.
    if (selection.hash) scrollToSectionById(selection.hash);
    close();
  };

  // Scoped placeholder mirrors the active chip ("Search API reference...").
  const activeChipLabel = scopeChips.find((chip) => chip.value === scope)?.label;
  const placeholder = activeChipLabel ? t('c:placeholder.search_resource', { resource: activeChipLabel }) : t('c:docs.search.placeholder');

  return (
    <Combobox<SearchSelection>
      inline
      openOnInputClick={false}
      value={null}
      onValueChange={(selection) => {
        if (selection) onSelect(selection);
      }}
      inputValue={searchValue}
      onInputValueChange={(value) => setSearchValue(resolveSearchInput(searchValue, value, recentSearches))}
      filter={() => true}
    >
      <div className="rounded-lg shadow-2xl">
        <ComboboxSearchInput
          ref={focusRef}
          value={searchValue}
          isSearching={isSearching}
          spinnerDelay={0}
          className="h-12 text-lg"
          wrapClassName="h-12 text-lg"
          placeholder={placeholder}
        />
        {/* Height and scrolling live on the ScrollArea viewport; the list's own max-h/overflow are neutralized */}
        <ScrollArea className="sm:h-[45vh]">
          <ComboboxList className="h-full max-h-none overflow-visible">
            {results === null && recentSearches.length > 0 && <SearchHistoryGroup searches={recentSearches} onRemove={deleteRecentSearch} />}
            {results === null && recentSearches.length === 0 && (
              <ContentPlaceholder icon={SearchIcon} title="c:docs.search.text" className="sm:h-[41vh]" />
            )}
            {results !== null && results.length === 0 && (
              <ContentPlaceholder
                icon={SearchIcon}
                title="c:no_resource_found"
                titleProps={{ resource: t('c:results').toLowerCase() }}
                className="sm:h-[41vh]"
              />
            )}
            {results !== null && results.length > 0 && (
              <div className="p-1">
                {results.map((item) => (
                  <ComboboxItem key={item.id} value={item} className="py-2">
                    <DocsSearchRow item={item} />
                  </ComboboxItem>
                ))}
              </div>
            )}
          </ComboboxList>
        </ScrollArea>
        {/* Scope chips: outside the tab order (fumadocs pattern), arrow keys stay on the list. */}
        <div className="flex items-center gap-1 border-t p-2">
          {[{ value: 'all' as const, label: t('c:all') }, ...scopeChips].map((chip) => (
            <button
              type="button"
              key={chip.value}
              tabIndex={-1}
              onClick={() => setScope(chip.value)}
              className={cn(
                'rounded-md border px-2 py-0.5 font-medium text-xs transition-colors',
                scope === chip.value ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50',
              )}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>
    </Combobox>
  );
}
