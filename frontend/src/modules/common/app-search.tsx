import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { organizationSuggestionSchema, userSuggestionSchema, workspaceSuggestionSchema } from 'backend/modules/general/schema';
import type { PageResourceType } from 'backend/types/common';
import { History, Loader2, X, Search } from 'lucide-react';
import { Fragment, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import StickyBox from 'react-sticky-box';
import type { z } from 'zod';
import { getSuggestions } from '~/api/general';
import { dialog } from '~/modules/common/dialoger/state';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandLoading, CommandSeparator } from '~/modules/ui/command';
import { useNavigationStore } from '~/store/navigation';
import { ScrollArea } from '../ui/scroll-area';
import { AvatarWrap } from './avatar-wrap';
import ContentPlaceholder from './content-placeholder';

type SuggestionType = z.infer<typeof userSuggestionSchema> | z.infer<typeof organizationSuggestionSchema> | z.infer<typeof workspaceSuggestionSchema>;

interface SuggestionSection {
  id: 'users' | 'organizations' | 'workspaces';
  label: string;
  type: PageResourceType;
}

const suggestionSections: SuggestionSection[] = [
  { id: 'users', label: 'common:users', type: 'USER' },
  { id: 'organizations', label: 'common:organizations', type: 'ORGANIZATION' },
  { id: 'workspaces', label: 'common:workspaces', type: 'WORKSPACE' },
];

export const AppSearch = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);

  const [searchValue, setSearchValue] = useState('');

  const recentSearches = useNavigationStore((state) => state.recentSearches);

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
    queryKey: ['search', searchValue],
    queryFn: () => getSuggestions(searchValue),
    enabled: searchValue.length > 0,
    initialData: { users: [], organizations: [], workspaces: [], total: 0 },
  });

  const onSelectSuggestion = (suggestion: SuggestionType) => {
    // Update recent searches with the search value
    updateRecentSearches(searchValue);

    navigate({
      to: suggestion.type === 'ORGANIZATION' ? '/$idOrSlug' : `/${suggestion.type.toLowerCase()}/$idOrSlug`,
      resetScroll: false,
      params: {
        idOrSlug: suggestion.slug,
      },
    });

    dialog.remove(false);
  };

  useEffect(() => {
    if (scrollAreaRef.current) scrollAreaRef.current.scrollTop = 0;
  }, [suggestions]);

  return (
    <Command className="rounded-lg border" shouldFilter={false}>
      <CommandInput
        value={searchValue}
        clearValue={setSearchValue}
        autoFocus
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
      <ScrollArea id={'suggestion-search'} ref={scrollAreaRef} className="h-[50vh] sm:h-[40vh] overflow-y-auto">
        {isFetching && (
          <CommandLoading>
            <Loader2 className="text-muted-foreground h-6 w-6 mx-auto mt-2 animate-spin" />
          </CommandLoading>
        )}
        {
          <CommandList className="px-1 h-full">
            {suggestions.total === 0 && (
              <>
                {!!searchValue.length && (
                  <CommandEmpty className="h-full">
                    <ContentPlaceholder Icon={Search} title={t('common:no_results_found')} />
                  </CommandEmpty>
                )}
                {searchValue.length === 0 && (
                  <CommandEmpty className="h-full">
                    <ContentPlaceholder Icon={Search} title={t('common:global_search.text')} />
                  </CommandEmpty>
                )}
                {!!recentSearches.length && (
                  <CommandGroup>
                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground bg-popover">{t('common:history')}</div>
                    {recentSearches.map((search, index) => (
                      <CommandItem key={search} onSelect={() => setSearchValue(search)} className="justify-between">
                        <div className="flex space-x-2 items-center outline-0 ring-0 group">
                          <History className="h-5 w-5" />
                          <span className="underline-offset-4 truncate font-medium">{search}</span>
                        </div>
                        <div className="flex items-center">
                          <span className="max-xs:hidden text-xs opacity-50 ml-3 mr-1">{index}</span>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              deleteItemFromList(search);
                            }}
                          >
                            <X className="h-5 w-5 opacity-70 hover:opacity-100" />
                          </button>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </>
            )}
            {suggestions.total > 0 && (
              <>
                {suggestionSections.map((section, index) => {
                  const hasPrevious = index > 0 && suggestions[suggestionSections[index - 1].id].length > 0;
                  const hasNext = index < suggestionSections.length - 1 && suggestions[suggestionSections[index + 1].id].length > 0;

                  return (
                    <Fragment key={section.id}>
                      {hasPrevious && hasNext && <CommandSeparator />}
                      <CommandGroup className="">
                        {hasNext && (
                          <StickyBox className="z-10 px-2 py-1.5 text-xs font-medium text-muted-foreground bg-popover">{t(section.label)}</StickyBox>
                        )}
                        {suggestions[section.id].map((suggestion: SuggestionType) => (
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
              </>
            )}
          </CommandList>
        }
      </ScrollArea>
    </Command>
  );
};
