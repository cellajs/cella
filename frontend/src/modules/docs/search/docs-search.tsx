import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ArrowLeftRightIcon, BracesIcon, ChevronRightIcon, FileTextIcon, HashIcon, SearchIcon } from 'lucide-react';
import { Fragment, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { parseTerms } from 'shared/utils/text-match';
import { scrollToSectionById } from '~/hooks/scroll-spy-store';
import { useDebounce } from '~/hooks/use-debounce';
import { useFocusByRef } from '~/hooks/use-focus-by-ref';
import { ComboboxSearchInput } from '~/modules/common/combobox-search-input';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { dialoger } from '~/modules/common/dialoger/use-dialoger';
import { HighlightText } from '~/modules/common/match-highlight/highlight-text';
import { MatchScope } from '~/modules/common/match-highlight/match-scope';
import { SearchDialogBar } from '~/modules/common/search-dialog-bar';
import { type HistoryEntry, SearchHistoryGroup } from '~/modules/common/search-history-group';
import { SearchRowIcon } from '~/modules/common/search-row-icon';
import { sheeter } from '~/modules/common/sheeter/use-sheeter';
import { MethodLabel } from '~/modules/docs/operations/method-label';
import { getDocsSearchClient } from '~/modules/docs/search/client';
import { useDocsSearchStore } from '~/modules/docs/search/docs-search-store';
import type { DocsSearchResult, DocsSearchScope } from '~/modules/docs/search/types';
import { docsSidebarSheetId } from '~/modules/docs/sidebar/docs-sidebar-sheet';
import { docsConfig } from '~/modules/page/content';
import { Combobox, ComboboxItem, ComboboxList } from '~/modules/ui/combobox';
import { ScrollArea } from '~/modules/ui/scroll-area';
import { cn } from '~/utils/cn';
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
  const saveRecentSearch = useDocsSearchStore((state) => state.saveRecentSearch);
  const removeRecentSearch = useDocsSearchStore((state) => state.removeRecentSearch);

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
    navigate({ to: selection.to, params: selection.params, search: selection.search, hash: selection.hash, resetScroll: false });
    // Queued scroll: resolves once the target section is mounted and laid out.
    if (selection.hash) scrollToSectionById(selection.hash);
    close();
  };

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
      open
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
        <SearchDialogBar hasSearch={!!searchValue} onClear={() => setSearchValue('')}>
          <ComboboxSearchInput
            ref={focusRef}
            value={searchValue}
            isSearching={isSearching}
            spinnerDelay={0}
            enterKeyHint="search"
            // The field's size-5 icon takes the center of the rows' size-4 icons, and its text the text after them
            className="-ml-0.5 h-12 text-lg"
            wrapClassName="h-12 flex-1 border-b-0 pl-3.5 text-lg"
            placeholder={placeholder}
          />
        </SearchDialogBar>
        {/* Height and scrolling live on the ScrollArea viewport, so the list's own max-h and overflow are off */}
        <ScrollArea
          className="max-sm:order-1 max-sm:flex max-sm:min-h-0 max-sm:flex-1 max-sm:flex-col sm:h-[45vh]"
          viewportClassName="max-sm:min-h-0 overscroll-none max-sm:pb-[env(safe-area-inset-bottom)]"
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
        {/* Outside the tab order, so arrow keys stay on the list; on a phone under the field, clear of the keyboard */}
        <div className="flex shrink-0 items-center gap-1 border-t px-4 py-2 max-sm:border-t-0 max-sm:border-b">
          {[{ value: 'all' as const, label: t('c:all') }, ...scopeChips].map((chip) => (
            <button
              type="button"
              key={chip.value}
              tabIndex={-1}
              aria-pressed={scope === chip.value}
              onClick={() => setScope(chip.value)}
              className="border-input text-muted-foreground hover:bg-hover hover:text-foreground aria-pressed:bg-muted aria-pressed:text-foreground rounded-md border px-2 py-0.5 text-xs font-medium transition-colors"
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>
    </Combobox>
  );
}

const treeLineClass = 'absolute left-2 w-px bg-muted-foreground/30';

/** Heading and text rows hang under their page row with a continuous tree line, which parts around a heading's icon. */
function DocsSearchRow({ item }: { item: DocsSearchResult }) {
  if (item.type === 'heading' || item.type === 'text') {
    return (
      <div className="relative flex w-full min-w-0 items-center gap-2">
        {item.type === 'heading' ? (
          <>
            <span aria-hidden="true" className={cn(treeLineClass, '-top-2 bottom-[calc(50%+0.625rem)]')} />
            <span aria-hidden="true" className={cn(treeLineClass, 'top-[calc(50%+0.625rem)] -bottom-2')} />
          </>
        ) : (
          <span aria-hidden="true" className={cn(treeLineClass, '-inset-y-2')} />
        )}
        <SearchRowIcon>{item.type === 'heading' && <HashIcon className="text-muted-foreground size-3.5" />}</SearchRowIcon>
        <span className={cn('truncate', item.type === 'text' && 'text-muted-foreground')}>
          <HighlightText text={item.title} />
        </span>
      </div>
    );
  }

  const LeadingIcon = item.method ? ArrowLeftRightIcon : item.type === 'schema' ? BracesIcon : FileTextIcon;
  return (
    <div className="flex w-full min-w-0 items-end gap-2">
      {/* h-5 is the title's line: the icon and method stay on it under a breadcrumb */}
      <SearchRowIcon className="h-5">
        <LeadingIcon className="text-muted-foreground" />
      </SearchRowIcon>
      <div className="flex min-w-0 grow flex-col gap-0.5">
        {item.breadcrumbs.length > 0 && (
          <span className="text-muted-foreground flex items-center gap-0.5 text-xs">
            {item.breadcrumbs.map((crumb, index) => (
              <Fragment key={crumb}>
                {index > 0 && <ChevronRightIcon className="size-3" />}
                <span className="truncate">{crumb}</span>
              </Fragment>
            ))}
          </span>
        )}
        <span className={cn('truncate font-medium', item.deprecated && 'text-muted-foreground line-through')}>
          <HighlightText text={item.title} />
        </span>
      </div>
      {/* After the title: its width differs per method, and text keeps one column */}
      {item.method && (
        <span className="flex h-5 items-center">
          <MethodLabel method={item.method} />
        </span>
      )}
    </div>
  );
}
