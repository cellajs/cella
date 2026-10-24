import { useInfiniteQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { SearchIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { UserBase } from 'sdk';
import { appConfig } from 'shared';
import { useDebounce } from '~/hooks/use-debounce';
import { useFocusByRef } from '~/hooks/use-focus-by-ref';
import { useMountedState } from '~/hooks/use-mounted-state';
import { getChannelListQueries } from '~/lib/entity-modules';
import { ComboboxSearchInput } from '~/modules/common/combobox-search-input';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { dialoger } from '~/modules/common/dialoger/use-dialoger';
import { SearchDialogBar } from '~/modules/common/search-dialog-bar';
import { type HistoryEntry, isHistoryEntry, SearchHistoryGroup } from '~/modules/common/search-history-group';
import type { EnrichedChannel } from '~/modules/entities/types';
import { navigationStore, useNavigationStore } from '~/modules/navigation/navigation-store';
import { SearchResultBlock } from '~/modules/navigation/search-result-block';
import { Combobox, ComboboxEmpty, ComboboxList } from '~/modules/ui/combobox';
import { ScrollArea } from '~/modules/ui/scroll-area';
import { Skeleton } from '~/modules/ui/skeleton';
import { usersListQueryOptions } from '~/modules/user/query';
import { getChannelRoute, pageTopHashNav } from '~/utils/channel-route';
import { isTouchInteraction } from '~/utils/input-modality';
import { addRecentSearch, resolveSearchInput, withoutRecentSearch } from '~/utils/recent-searches';

const searchableEntityTypes = ['user', ...appConfig.channelEntityTypes] as const;

function SearchResultsSkeleton() {
  // Stays hidden briefly, so a fast response never flashes the skeleton.
  const { hasStarted } = useMountedState();

  return (
    <div data-started={hasStarted} className="flex flex-col gap-4 p-4 transition-opacity duration-300 data-[started=false]:opacity-0">
      {Array.from({ length: 3 }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholder.
        <div key={i} className="flex items-center gap-3 py-1.5">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <Skeleton className="h-4 w-48" />
        </div>
      ))}
    </div>
  );
}

type SearchSelection = EnrichedChannel | UserBase | HistoryEntry;

export function AppSearch() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const [searchValue, setSearchValue] = useState('');
  const debouncedSearchValue = useDebounce(searchValue, 300, { immediateValue: '' });
  // Collapse state lives here, so it survives result reloads while typing; it resets with the dialog.
  const [collapsedTypes, setCollapsedTypes] = useState<Partial<Record<string, boolean>>>({});
  const toggleCollapsed = (entityType: string) => setCollapsedTypes((prev) => ({ ...prev, [entityType]: !prev[entityType] }));

  const recentSearches = useNavigationStore((state) => state.recentSearches);

  const { focusRef } = useFocusByRef();

  const removeRecentSearch = (search: string) => {
    navigationStore.setState((state) => {
      const searches = withoutRecentSearch(state.recentSearches, search);
      return searches === state.recentSearches ? state : { ...state, recentSearches: searches };
    });
  };

  const saveRecentSearch = (value: string) => {
    navigationStore.setState((state) => {
      const searches = addRecentSearch(state.recentSearches, value);
      return searches === state.recentSearches ? state : { ...state, recentSearches: searches };
    });
  };

  const hasQuery = debouncedSearchValue.length > 0;

  const userQuery = useInfiniteQuery({ ...usersListQueryOptions({ q: debouncedSearchValue }), enabled: hasQuery });

  const channelQueries = Object.entries(getChannelListQueries()).map(([entityType, queryOptions]) => ({
    entityType,
    query: useInfiniteQuery({
      // biome-ignore lint/suspicious/noExplicitAny: queryOptions union covers heterogeneous entity types.
      ...(queryOptions as any)({ q: debouncedSearchValue }),
      enabled: hasQuery,
    }),
  }));
  const queries = [userQuery, ...channelQueries.map(({ query }) => query)];

  const resultsByType: Record<string, (EnrichedChannel | UserBase)[]> = {
    user: hasQuery ? (userQuery.data?.pages.flatMap((page) => page.items) ?? []) : [],
    ...Object.fromEntries(
      channelQueries.map(({ entityType, query }) => [
        entityType,
        // biome-ignore lint/suspicious/noExplicitAny: query data types vary per entity
        hasQuery ? ((query.data as any)?.pages.flatMap((page: any) => page.items) ?? []) : [],
      ]),
    ),
  };
  const notFound = Object.values(resultsByType).every((items) => items.length === 0);
  const firstTypeWithResults = searchableEntityTypes.find((entityType) => (resultsByType[entityType] ?? []).length > 0);
  // The debounce gap counts as loading, so the skeleton shows in place of the empty state.
  const isDebouncePending = searchValue.length > 0 && searchValue !== debouncedSearchValue;
  // Counts only with a query: an empty q shares its cache key with the default list pages, whose refetches would hold the spinner.
  const isQueryFetching = hasQuery && queries.some((query) => query.isFetching);
  const isFetching = isDebouncePending || isQueryFetching;
  const isLoading = searchValue.length > 0 && (isDebouncePending || queries.some((query) => query.isLoading));
  const hasHistoryToShow = !searchValue.length && recentSearches.length > 0;

  const openItem = (item: EnrichedChannel | UserBase) => {
    saveRecentSearch(searchValue);

    if (item.entityType === 'user') {
      navigate({ to: '.', search: (prev) => ({ ...prev, userSheetId: item.id }), resetScroll: false });
    } else {
      const { to, params, search } = getChannelRoute(item);
      navigate({ to, params, search, ...pageTopHashNav, resetScroll: false });
    }

    dialoger.getState().remove('search');
  };

  return (
    <Combobox<SearchSelection>
      inline
      openOnInputClick={false}
      value={null}
      onValueChange={(selection) => {
        if (!selection) return;
        if (isHistoryEntry(selection)) {
          setSearchValue(selection.value);
          return;
        }
        openItem(selection);
      }}
      inputValue={searchValue}
      onInputValueChange={(value) => setSearchValue(resolveSearchInput(searchValue, value, recentSearches))}
      filter={() => true}
      // On touch the keyboard's Search key would open a highlighted first result the user never chose.
      autoHighlight={!isTouchInteraction()}
    >
      <div className="flex min-h-0 flex-col rounded-lg shadow-2xl max-sm:flex-1">
        <SearchDialogBar>
          <ComboboxSearchInput
            ref={focusRef}
            value={searchValue}
            onClear={() => setSearchValue('')}
            isSearching={isFetching}
            spinnerDelay={0}
            enterKeyHint="search"
            className="h-12 text-lg"
            wrapClassName="h-12 flex-1 border-b-0 text-lg"
            placeholder={t('c:placeholder.search')}
          />
        </SearchDialogBar>
        {/* Height and scrolling live on the ScrollArea viewport; the list's own max-h and overflow are cleared. On a phone
            the results take what the dialog has left above the keyboard. */}
        <ScrollArea
          id="item-search"
          ref={scrollAreaRef}
          className="max-sm:flex max-sm:min-h-0 max-sm:flex-1 max-sm:flex-col sm:h-[40vh]"
          viewportClassName="max-sm:min-h-0 overscroll-contain"
        >
          {!isLoading && notFound && !hasHistoryToShow && (
            <ComboboxEmpty className="h-full sm:h-[36vh]">
              <ContentPlaceholder
                icon={SearchIcon}
                title={hasQuery ? 'c:no_resource_found' : 'c:global_search.text'}
                titleOptions={{ resource: t('c:results').toLowerCase(), appName: appConfig.name }}
              />
            </ComboboxEmpty>
          )}
          {isLoading && <SearchResultsSkeleton />}
          <ComboboxList className="h-full max-h-none overflow-visible" hidden={notFound ? !hasHistoryToShow : isLoading}>
            {notFound && <SearchHistoryGroup searches={recentSearches} onRemove={removeRecentSearch} />}
            {!notFound && (
              <div className="p-1">
                {searchableEntityTypes.map((entityType) => (
                  <SearchResultBlock
                    key={entityType}
                    results={resultsByType[entityType] ?? []}
                    entityType={entityType}
                    hideSeparator={entityType === firstTypeWithResults}
                    collapsed={!!collapsedTypes[entityType]}
                    onToggleCollapsed={() => toggleCollapsed(entityType)}
                  />
                ))}
              </div>
            )}
          </ComboboxList>
        </ScrollArea>
      </div>
    </Combobox>
  );
}
