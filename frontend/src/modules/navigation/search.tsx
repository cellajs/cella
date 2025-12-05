import { useQueries } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { appConfig, ContextEntityType } from 'config';
import { HistoryIcon, SearchIcon, XIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ContextEntityBase, GetContextEntitiesResponse, UserBase } from '~/api.gen';
import useFocusByRef from '~/hooks/use-focus-by-ref';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { searchContextEntitiesQueryOptions } from '~/modules/entities/query';
import { SearchResultBlock } from '~/modules/navigation/search-result-block';
import { Button } from '~/modules/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '~/modules/ui/command';
import { ScrollArea } from '~/modules/ui/scroll-area';
import { searchUsersQueryOptions } from '~/modules/users/query';
import { getEntityRoute } from '~/routes-resolver';
import { useNavigationStore } from '~/store/navigation';

// Define searchable entity types
const searchableEntityTypes = ['user', ...appConfig.contextEntityTypes] as const;

export const AppSearch = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);

  const [searchValue, setSearchValue] = useState('');

  const { recentSearches } = useNavigationStore();

  const { focusRef, setFocus } = useFocusByRef();

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
    if (!value) return;
    if (value.replaceAll(' ', '').length < 3) return;
    const hasSubstringMatch = recentSearches.some((element) => element.toLowerCase().includes(value));
    if (hasSubstringMatch) return;
    useNavigationStore.setState((state) => {
      const searches = [...state.recentSearches];

      if (searches.includes(value)) {
        searches.splice(searches.indexOf(value), 1);
        searches.push(value);
      } else {
        searches.push(value);
        if (searches.length > 5) searches.shift();
      }
      return { ...state, recentSearches: searches };
    });
  };

  const { data, notFound, isFetching } = useQueries({
    queries: [searchContextEntitiesQueryOptions({ q: searchValue }), searchUsersQueryOptions({ q: searchValue })],
    combine: ([contextEntitiesResult, usersResult]) => {
      const usersData = usersResult.data;
      const entitiesData = contextEntitiesResult.data;
      const combinedTotal = (usersData.total || 0) + (entitiesData.total || 0);

      const groupedEntities = entitiesData?.items?.reduce(
        (acc, entity) => {
          const type = entity.entityType;
          (acc[type] ??= []).push(entity);
          return acc;
        },
        {} as Record<ContextEntityType, GetContextEntitiesResponse['items'][number][]>,
      );

      return {
        data: {
          user: usersData.items,
          ...groupedEntities,
        },
        notFound: combinedTotal === 0, // true if there are no results
        isFetching: usersResult.isFetching || contextEntitiesResult.isFetching,
      };
    },
  });

  const onSelectItem = (item: ContextEntityBase | UserBase) => {
    // Update recent searches with the search value
    updateRecentSearches(searchValue);

    const { to, params, search } = getEntityRoute(item);
    navigate({ to, params, search, resetScroll: false });

    useDialoger.getState().remove();
  };

  return (
    <Command className="rounded-lg shadow-2xl" shouldFilter={false}>
      <CommandInput
        value={searchValue}
        ref={focusRef}
        clearValue={() => {
          setSearchValue('');
          setFocus();
        }}
        className="h-12 text-lg"
        isSearching={isFetching}
        wrapClassName="h-12 text-lg"
        placeholder={t('common:placeholder.search')}
        onValueChange={(searchValue) => {
          const historyIndexes = recentSearches.map((_, index) => index);
          if (historyIndexes.includes(Number.parseInt(searchValue, 10))) {
            setSearchValue(recentSearches[+searchValue]);
            return;
          }
          setSearchValue(searchValue);
        }}
      />
      <ScrollArea id={'item-search'} ref={scrollAreaRef} className="sm:h-[40vh] overflow-y-auto">
        <CommandList className="h-full">
          <CommandEmpty className="h-full sm:h-[36vh]">
            <ContentPlaceholder
              icon={SearchIcon}
              title={searchValue.length ? 'common:no_resource_found' : 'common:global_search.text'}
              titleProps={{ resource: t('common:results').toLowerCase(), appName: appConfig.name }}
            />
          </CommandEmpty>
          {notFound && !searchValue.length && !!recentSearches.length && (
            <CommandGroup>
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground bg-popover">{t('common:history')}</div>
              {recentSearches.map((search, index) => (
                <CommandItem key={search} onSelect={() => setSearchValue(search)} className="justify-between">
                  <div className="flex gap-2 items-center outline-0 ring-0 group">
                    <HistoryIcon className="h-5 w-5" />
                    <span className="underline-offset-4 truncate font-medium">{search}</span>
                  </div>
                  <div className="flex items-center">
                    <span className="max-sm:hidden text-xs opacity-50 mx-3">{index}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="p-0 h-6 w-6"
                      onClick={(event) => {
                        event.stopPropagation();
                        deleteItemFromList(search);
                      }}
                    >
                      <XIcon className="h-5 w-5 opacity-70 hover:opacity-100" />
                    </Button>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {searchableEntityTypes.map((entityType) => (
            <SearchResultBlock key={entityType} results={data[entityType] ?? []} entityType={entityType} onSelect={onSelectItem} />
          ))}
        </CommandList>
      </ScrollArea>
    </Command>
  );
};
