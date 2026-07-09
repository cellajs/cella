import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { HistoryIcon, SearchIcon, XIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDebounce } from '~/hooks/use-debounce';
import { useFocusByRef } from '~/hooks/use-focus-by-ref';
import { scrollToSectionById } from '~/hooks/use-scroll-spy-store';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { getDocsSearchClient } from '~/modules/docs/search/client';
import { DocsSearchRow } from '~/modules/docs/search/docs-search-row';
import { deleteRecentSearch, updateRecentSearches, useDocsSearchStore } from '~/modules/docs/search/docs-search-store';
import type { DocsSearchResult, DocsSearchScope } from '~/modules/docs/search/types';
import { docsConfig } from '~/modules/page/content';
import { Button } from '~/modules/ui/button';
import {
  Combobox,
  ComboboxGroup,
  ComboboxGroupLabel,
  ComboboxItem,
  ComboboxList,
  ComboboxSearchInput,
} from '~/modules/ui/combobox';
import { ScrollArea } from '~/modules/ui/scroll-area';
import { cn } from '~/utils/cn';

type HistoryEntry = { kind: 'history'; value: string };
type SearchSelection = DocsSearchResult | HistoryEntry;

/** Scope chips, labeled by the config-driven sidebar section labels. */
const scopeChips: { value: DocsSearchScope; label: string }[] = [
  { value: 'pages', label: docsConfig.sections.find((s) => s.id === 'pages')?.label ?? 'Documentation' },
  { value: 'api', label: docsConfig.sections.find((s) => s.id === 'apiReference')?.label ?? 'API' },
];

/**
 * Docs search dialog: full client-side search over docs pages and the API
 * reference. Unlike the app search this needs no server and works offline.
 */
export const DocsSearch = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { focusRef } = useFocusByRef();

  const [searchValue, setSearchValue] = useState('');
  const debouncedValue = useDebounce(searchValue, 100, { immediateValue: '' });
  const [scope, setScope] = useState<DocsSearchScope>('all');
  const { recentSearches } = useDocsSearchStore();

  // null = blank query (default links); previous results stay visible while a
  // new search runs so the list never blanks mid-typing.
  const [results, setResults] = useState<DocsSearchResult[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);

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
    // History entry: re-run that query instead of navigating.
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
  const placeholder = activeChipLabel
    ? t('c:placeholder.search_resource', { resource: activeChipLabel })
    : t('c:docs.search.placeholder');

  return (
    <Combobox<SearchSelection>
      inline
      openOnInputClick={false}
      value={null}
      onValueChange={(selection) => {
        if (selection) onSelect(selection);
      }}
      inputValue={searchValue}
      onInputValueChange={(value) => {
        // Typing a bare history index (shown next to the row) re-runs that search.
        const historyIndexes = recentSearches.map((_, index) => index);
        if (historyIndexes.includes(Number.parseInt(value, 10))) {
          setSearchValue(recentSearches[+value]);
          return;
        }
        setSearchValue(value);
      }}
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
        {/* Height + scrolling live on the ScrollArea viewport (styled scrollbar);
            the list's own max-h/overflow are neutralized so it never scrolls natively. */}
        <ScrollArea className="sm:h-[45vh]">
          <ComboboxList className="h-full max-h-none overflow-visible">
            {results === null && recentSearches.length > 0 && (
              <ComboboxGroup className="p-1">
                <ComboboxGroupLabel>{t('c:history')}</ComboboxGroupLabel>
                {recentSearches.map((search, index) => (
                  <ComboboxItem
                    key={search}
                    value={{ kind: 'history', value: search } as HistoryEntry}
                    className="justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <HistoryIcon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate font-medium">{search}</span>
                    </div>
                    <div className="flex items-center">
                      <span className="mx-3 text-xs opacity-50 max-sm:hidden">{index}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 p-0"
                        onClick={(event) => {
                          event.stopPropagation();
                          deleteRecentSearch(search);
                        }}
                      >
                        <XIcon className="size-4 opacity-70 hover:opacity-100" />
                      </Button>
                    </div>
                  </ComboboxItem>
                ))}
              </ComboboxGroup>
            )}
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
};
