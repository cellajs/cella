import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { SearchIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { parseTerms } from 'shared/utils/text-match';
import { scrollToSectionById } from '~/hooks/scroll-spy-store';
import { useDebounce } from '~/hooks/use-debounce';
import { useFocusByRef } from '~/hooks/use-focus-by-ref';
import { ComboboxSearchInput } from '~/modules/common/combobox-search-input';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { dialoger } from '~/modules/common/dialoger/use-dialoger';
import { MatchScope } from '~/modules/common/match-highlight/match-scope';
import { SearchDialogBar } from '~/modules/common/search-dialog-bar';
import { type HistoryEntry, SearchHistoryGroup } from '~/modules/common/search-history-group';
import { sheeter } from '~/modules/common/sheeter/use-sheeter';
import { getDocsSearchClient } from '~/modules/docs/search/client';
import { DocsSearchRow } from '~/modules/docs/search/docs-search-row';
import { removeRecentSearch, saveRecentSearch, useDocsSearchStore } from '~/modules/docs/search/docs-search-store';
import type { DocsSearchResult, DocsSearchScope } from '~/modules/docs/search/types';
import { docsSidebarSheetId } from '~/modules/docs/sidebar/docs-sidebar-sheet';
import { docsConfig } from '~/modules/page/content';
import { Combobox, ComboboxItem, ComboboxList } from '~/modules/ui/combobox';
import { ScrollArea } from '~/modules/ui/scroll-area';
import { isTouchInteraction } from '~/utils/input-modality';
import { resolveSearchInput } from '~/utils/recent-searches';

type SearchSelection = DocsSearchResult | HistoryEntry;

export const docsSearchDialogId = 'docs-search';

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
    dialoger.getState().remove(docsSearchDialogId);
    // On mobile, search opens from the sidebar sheet; close that too.
    sheeter.getState().remove(docsSidebarSheetId);
  };

  const handleSelect = (selection: SearchSelection) => {
    // History entries re-run their query without navigating.
    if ('kind' in selection) {
      setSearchValue(selection.value);
      return;
    }
    saveRecentSearch(searchValue);
    navigate({ to: selection.to, params: selection.params, hash: selection.hash, resetScroll: false });
    // Queued scroll: resolves once the target section is mounted and laid out.
    if (selection.hash) scrollToSectionById(selection.hash);
    close();
  };

  // Scope chips carry the docs config's sidebar section labels
  const scopeChips: { value: DocsSearchScope; label: string }[] = [
    { value: 'pages', label: docsConfig.sections.find((section) => section.id === 'pages')?.label ?? t('c:documentation') },
    { value: 'api', label: docsConfig.sections.find((section) => section.id === 'apiReference')?.label ?? t('c:docs.api_reference') },
  ];
  // Scoped placeholder mirrors the active chip ("Search API reference...").
  const activeChipLabel = scopeChips.find((chip) => chip.value === scope)?.label;
  const placeholder = activeChipLabel ? t('c:placeholder.search_resource', { resource: activeChipLabel }) : t('c:placeholder.search_docs');

  return (
    <Combobox<SearchSelection>
      inline
      openOnInputClick={false}
      value={null}
      onValueChange={(selection) => {
        if (selection) handleSelect(selection);
      }}
      inputValue={searchValue}
      onInputValueChange={(value) => setSearchValue(resolveSearchInput(searchValue, value, recentSearches))}
      filter={() => true}
      // On touch the keyboard's Search key would open a highlighted first result the user never chose.
      autoHighlight={!isTouchInteraction()}
    >
      <div className="flex min-h-0 flex-col max-sm:flex-1 sm:rounded-lg sm:shadow-2xl">
        <SearchDialogBar>
          <ComboboxSearchInput
            ref={focusRef}
            value={searchValue}
            onClear={() => setSearchValue('')}
            isSearching={isSearching}
            spinnerDelay={0}
            enterKeyHint="search"
            className="h-12 text-lg"
            wrapClassName="h-12 flex-1 border-b-0 text-lg"
            placeholder={placeholder}
          />
        </SearchDialogBar>
        {/* Height and scrolling live on the ScrollArea viewport; the list's own max-h/overflow are neutralized. On a phone
            the results take what the dialog has left above the keyboard, below the scope chips. */}
        <ScrollArea
          className="max-sm:order-1 max-sm:flex max-sm:min-h-0 max-sm:flex-1 max-sm:flex-col sm:h-[45vh]"
          viewportClassName="max-sm:min-h-0 overscroll-contain max-sm:pb-[env(safe-area-inset-bottom)]"
        >
          {results === null && recentSearches.length === 0 && (
            <ContentPlaceholder icon={SearchIcon} title="c:docs.search.text" className="sm:h-[41vh]" />
          )}
          {results !== null && results.length === 0 && (
            <ContentPlaceholder icon={SearchIcon} title="c:no_resource_found" titleOptions={{ resource: t('c:results') }} className="sm:h-[41vh]" />
          )}
          <ComboboxList className="h-full max-h-none overflow-visible" hidden={results === null ? !recentSearches.length : !results.length}>
            {results === null && <SearchHistoryGroup searches={recentSearches} onRemove={removeRecentSearch} />}
            {results !== null && (
              <MatchScope terms={parseTerms(debouncedValue)}>
                <div className="p-1">
                  {results.map((item) => (
                    <ComboboxItem key={item.id} value={item} className="py-2">
                      <DocsSearchRow item={item} />
                    </ComboboxItem>
                  ))}
                </div>
              </MatchScope>
            )}
          </ComboboxList>
        </ScrollArea>
        {/* Scope chips: outside the tab order (fumadocs pattern), arrow keys stay on the list. On a phone under the field, clear of the keyboard. */}
        <div className="flex shrink-0 items-center gap-1 border-t p-2 max-sm:border-t-0 max-sm:border-b">
          {[{ value: 'all' as const, label: t('c:all') }, ...scopeChips].map((chip) => (
            <button
              type="button"
              key={chip.value}
              tabIndex={-1}
              aria-pressed={scope === chip.value}
              onClick={() => setScope(chip.value)}
              className="rounded-md border border-input px-2 py-0.5 font-medium text-muted-foreground text-xs transition-colors hover:bg-muted hover:text-foreground aria-pressed:bg-muted aria-pressed:text-foreground"
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>
    </Combobox>
  );
}
