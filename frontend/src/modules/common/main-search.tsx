import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { entitySuggestionSchema } from 'backend/modules/general/schema';
import type { Entity } from 'backend/types/common';
import { config } from 'config';
import { History, Search, X } from 'lucide-react';
import { Fragment, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { getSuggestions } from '~/api/general';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { dialog } from '~/modules/common/dialoger/state';
import StickyBox from '~/modules/common/sticky-box';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandLoading, CommandSeparator } from '~/modules/ui/command';
import { ScrollArea } from '~/modules/ui/scroll-area';
import { getEntityPath, suggestionSections } from '~/nav-config';
import { useNavigationStore } from '~/store/navigation';
import { Button } from '../ui/button';
import Spinner from './spinner';

export type SuggestionType = z.infer<typeof entitySuggestionSchema>;

export interface SuggestionSection {
  id: string;
  label: string;
  type: Entity;
}

export const MainSearch = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);

  const [searchValue, setSearchValue] = useState('');

  const { recentSearches } = useNavigationStore();

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

  const { data: suggestions, isFetching } = useQuery({
    initialData: { items: [], total: 0 },
    queryKey: ['search', searchValue],
    queryFn: () => getSuggestions(searchValue),
    staleTime: 0,
    enabled: searchValue.length > 0,
  });

  const onSelectSuggestion = (suggestion: SuggestionType) => {
    // Update recent searches with the search value
    updateRecentSearches(searchValue);

    const { orgIdOrSlug, idOrSlug, path } = getEntityPath(suggestion);

    navigate({
      to: path,
      resetScroll: false,
      params: { idOrSlug, orgIdOrSlug },
    });

    dialog.remove(false);
  };

  useEffect(() => {
    if (scrollAreaRef.current) scrollAreaRef.current.scrollTop = 0;
  }, [suggestions]);

  return (
    <Command className="rounded-lg border shadow-2xl" shouldFilter={false}>
      <CommandInput
        value={searchValue}
        clearValue={setSearchValue}
        className="h-12 text-lg"
        autoFocus
        wrapClassName="text-lg"
        placeholder={t('common:placeholder.search')}
        onValueChange={(searchValue) => {
          const historyIndexes = recentSearches.map((_, index) => index);
          if (historyIndexes.includes(Number.parseInt(searchValue))) {
            setSearchValue(recentSearches[+searchValue]);
            return;
          }
          setSearchValue(searchValue);
        }}
      />
      <ScrollArea id={'suggestion-search'} ref={scrollAreaRef} className="sm:h-[40vh] overflow-y-auto">
        {isFetching && (
          <CommandLoading className="mt-2">
            <Spinner inline />
          </CommandLoading>
        )}
        {
          <CommandList className="h-full">
            {suggestions.total === 0 && (
              <>
                {!!searchValue.length && (
                  <CommandEmpty className="h-full">
                    <ContentPlaceholder
                      className="h-full"
                      Icon={Search}
                      title={t('common:no_resource_found', { resource: t('common:results').toLowerCase() })}
                    />
                  </CommandEmpty>
                )}
                {searchValue.length === 0 && (
                  <CommandEmpty className="h-full sm:h-[36vh]">
                    <ContentPlaceholder Icon={Search} title={t('common:global_search.text', { appName: config.name })} />
                  </CommandEmpty>
                )}
                {!!recentSearches.length && (
                  <CommandGroup>
                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground bg-popover">{t('common:history')}</div>
                    {recentSearches.map((search, index) => (
                      <CommandItem key={search} onSelect={() => setSearchValue(search)} className="justify-between">
                        <div className="flex gap-2 items-center outline-0 ring-0 group">
                          <History className="h-5 w-5" />
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
                            <X className="h-5 w-5 opacity-70 hover:opacity-100" />
                          </Button>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </>
            )}
            {suggestions.total > 0 &&
              suggestionSections.map((section) => {
                const filteredSuggestions = suggestions.items.filter((el) => el.entity === section.type);
                // Skip rendering if no items match the section type
                if (filteredSuggestions.length === 0) return null;
                return (
                  <Fragment key={section.id}>
                    <CommandSeparator />
                    <CommandGroup className="">
                      <StickyBox className="z-10 px-2 py-1.5 text-xs font-medium text-muted-foreground bg-popover">{t(section.label)}</StickyBox>
                      {filteredSuggestions.map((suggestion: SuggestionType) => (
                        <CommandItem key={suggestion.id} onSelect={() => onSelectSuggestion(suggestion)}>
                          <div className="flex space-x-2 items-center outline-0 ring-0 group">
                            <AvatarWrap
                              type={section.type}
                              className="h-8 w-8"
                              id={suggestion.id}
                              name={suggestion.name}
                              url={suggestion.thumbnailUrl}
                            />
                            <span className="group-hover:underline underline-offset-4 truncate font-medium">{suggestion.name}</span>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </Fragment>
                );
              })}
          </CommandList>
        }
      </ScrollArea>
    </Command>
  );
};
