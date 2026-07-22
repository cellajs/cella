import { useInfiniteQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { HistoryIcon, SearchIcon, XIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { UserBase } from 'sdk';
import { appConfig } from 'shared';
import { useDebounce } from '~/hooks/use-debounce';
import { useFocusByRef } from '~/hooks/use-focus-by-ref';
import { useMountedState } from '~/hooks/use-mounted-state';
import { channelListQueriesByType } from '~/list-queries-config';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import type { EnrichedChannel } from '~/modules/entities/types';
import { SearchResultBlock } from '~/modules/navigation/menu-sheet/search-result-block';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import { Button } from '~/modules/ui/button';
import {
  Combobox,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxItem,
  ComboboxList,
  ComboboxSearchInput,
} from '~/modules/ui/combobox';
import { ScrollArea } from '~/modules/ui/scroll-area';
import { Skeleton } from '~/modules/ui/skeleton';
import { usersListQueryOptions } from '~/modules/user/query';
import { getChannelRoute, pageTopHashNav } from '~/utils/channel-route';
import { addRecentSearch } from '~/utils/recent-searches';

// Define searchable entity types
const searchableEntityTypes = ['user', ...appConfig.channelEntityTypes] as const;

const SearchResultsSkeleton = () => {
  // Stay hidden for a short while, then fade in slowly to avoid flashing on fast responses.
  const { hasStarted } = useMountedState();

  return (
    <div
      className={`flex flex-col gap-4 p-4 transition-opacity duration-300 ${hasStarted ? 'opacity-100' : 'opacity-0'}`}
    >
      {Array.from({ length: 3 }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholder.
        <div key={i} className="flex items-center gap-3 py-1.5">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <Skeleton className="h-4 w-48" />
        </div>
      ))}
    </div>
  );
};

type HistoryEntry = { kind: 'history'; value: string };
type SearchSelection = EnrichedChannel | UserBase | HistoryEntry;

/**
 * Application search component.
 */
export const AppSearch = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);

  const [searchValue, setSearchValue] = useState('');
  // Debounce the value that drives queries so we don't fire a request on every keystroke.
  const debouncedSearchValue = useDebounce(searchValue, 300, { immediateValue: '' });

  const { recentSearches } = useNavigationStore();

  const { focusRef } = useFocusByRef();

  const deleteItemFromList = (item: string) => {
    useNavigationStore.setState((state) => {
      const searches = [...state.recentSearches];
      const index = searches.indexOf(item);
      if (index === -1) return;
      searches.splice(index, 1);
      return { ...state, recentSearches: searches };
    });
  };

  const updateRecentSearches = (value: string) => {
    useNavigationStore.setState((state) => {
      // Most recent on top, normalized/containment dedupe (shared with docs search).
      const searches = addRecentSearch(state.recentSearches, value);
      return searches === state.recentSearches ? state : { ...state, recentSearches: searches };
    });
  };

  const userQ = useInfiniteQuery({
    ...usersListQueryOptions({ q: debouncedSearchValue }),
    enabled: debouncedSearchValue.length > 0,
  });

  // Get channel entity queries from offline config
  const channelResults = Object.fromEntries(
    Object.entries(channelListQueriesByType).map(([entityType, queryOptions]) => [
      entityType,
      useInfiniteQuery({
        // biome-ignore lint/suspicious/noExplicitAny: queryOptions union covers heterogeneous entity types.
        ...(queryOptions as any)({ q: debouncedSearchValue }),
        enabled: debouncedSearchValue.length > 0,
      }),
    ]),
  );

  const users = debouncedSearchValue.length > 0 ? (userQ.data?.pages.flatMap((p) => p.items) ?? []) : [];
  const channelData = Object.fromEntries(
    Object.entries(channelResults).map(([entityType, query]) => [
      entityType,
      // biome-ignore lint/suspicious/noExplicitAny: query data types vary per entity
      debouncedSearchValue.length > 0 ? ((query.data as any)?.pages.flatMap((p: any) => p.items) ?? []) : [],
    ]),
  );

  const data: Record<string, (EnrichedChannel | UserBase)[]> = { user: users, ...channelData };
  const notFound = users.length === 0 && Object.values(channelData).every((items) => items.length === 0);
  // Treat the debounce gap (typed value not yet applied) as loading so we show the skeleton, not the empty state.
  const isDebouncePending = searchValue.length > 0 && searchValue !== debouncedSearchValue;
  // Include the debounce gap so the search-input spinner stays visible while typing, not just during the request.
  const isFetching = isDebouncePending || userQ.isFetching || Object.values(channelResults).some((q) => q.isFetching);
  const isLoading =
    searchValue.length > 0 &&
    (isDebouncePending || userQ.isLoading || Object.values(channelResults).some((q) => q.isLoading));

  const onSelectItem = (item: EnrichedChannel | UserBase) => {
    // Update recent searches with the search value
    updateRecentSearches(searchValue);

    // For users, open sheet
    if (item.entityType === 'user') {
      navigate({ to: '.', search: (prev) => ({ ...prev, userSheetId: item.id }), resetScroll: false });
    } else {
      const { to, params, search } = getChannelRoute(item);
      navigate({ to, params, search, ...pageTopHashNav, resetScroll: false });
    }

    useDialoger.getState().remove();
  };

  return (
    <Combobox<SearchSelection>
      inline
      openOnInputClick={false}
      value={null}
      onValueChange={(selection) => {
        if (!selection) return;
        if ('kind' in selection && selection.kind === 'history') {
          setSearchValue(selection.value);
          return;
        }
        onSelectItem(selection as EnrichedChannel | UserBase);
      }}
      inputValue={searchValue}
      onInputValueChange={(value) => {
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
          isSearching={isFetching}
          spinnerDelay={0}
          className="h-12 text-lg"
          wrapClassName="h-12 text-lg"
          placeholder={t('c:placeholder.search')}
        />
        {/* Height + scrolling live on the ScrollArea viewport (styled scrollbar);
            the list's own max-h/overflow are neutralized so it never scrolls natively. */}
        <ScrollArea id={'item-search'} ref={scrollAreaRef} className="sm:h-[40vh]">
          <ComboboxList className="h-full max-h-none overflow-visible">
            {!isLoading && notFound && !(!searchValue.length && !!recentSearches.length) && (
              <ComboboxEmpty className="h-full sm:h-[36vh]">
                <ContentPlaceholder
                  icon={SearchIcon}
                  title={debouncedSearchValue.length ? 'c:no_resource_found' : 'c:global_search.text'}
                  titleProps={{ resource: t('c:results').toLowerCase(), appName: appConfig.name }}
                />
              </ComboboxEmpty>
            )}
            {notFound && !searchValue.length && !!recentSearches.length && (
              <ComboboxGroup className="p-1">
                <div className="bg-popover px-2 py-2 font-medium text-muted-foreground text-xs">{t('c:history')}</div>
                {recentSearches.map((search, index) => (
                  <ComboboxItem
                    key={search}
                    value={{ kind: 'history', value: search } as HistoryEntry}
                    className="justify-between"
                  >
                    <div className="group flex items-center gap-2 outline-0 ring-0">
                      <HistoryIcon className="h-5 w-5" />
                      <span className="truncate font-medium underline-offset-4">{search}</span>
                    </div>
                    <div className="flex items-center">
                      <span className="mx-3 text-xs opacity-50 max-sm:hidden">{index}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 p-0"
                        onClick={(event) => {
                          event.stopPropagation();
                          deleteItemFromList(search);
                        }}
                      >
                        <XIcon className="h-5 w-5 opacity-70 hover:opacity-100" />
                      </Button>
                    </div>
                  </ComboboxItem>
                ))}
              </ComboboxGroup>
            )}
            {isLoading ? (
              <SearchResultsSkeleton />
            ) : (
              <div className="p-1">
                {(() => {
                  const firstWithResults = searchableEntityTypes.find(
                    (entityType) => (data[entityType] ?? []).length > 0,
                  );
                  return searchableEntityTypes.map((entityType) => (
                    <SearchResultBlock
                      key={entityType}
                      results={data[entityType] ?? []}
                      entityType={entityType}
                      hideSeparator={entityType === firstWithResults}
                    />
                  ));
                })()}
              </div>
            )}
          </ComboboxList>
        </ScrollArea>
      </div>
    </Combobox>
  );
};
