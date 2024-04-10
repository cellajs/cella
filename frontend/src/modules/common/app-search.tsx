import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Loader2, History, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type OrganizationSuggestion, type UserSuggestion, getSuggestions } from '~/api/general';
import { dialog } from '~/modules/common/dialoger/state';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList, CommandLoading, CommandSeparator } from '~/modules/ui/command';
import { useNavigationStore } from '~/store/navigation';
import { AvatarWrap } from './avatar-wrap';
import { ScrollArea } from '../ui/scroll-area';
import Sticky from 'react-sticky-el';

export const AppSearch = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const maxVisibleItemsRef = useRef(0);

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
    if (value.replaceAll(' ', '') === '') return;
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

  const { data, isFetching } = useQuery({
    queryKey: ['search', searchValue],
    queryFn: () => getSuggestions(searchValue),
    enabled: searchValue.length > 0,
  });

  const userSuggestions = data?.filter((suggestion) => suggestion.type === 'user') ?? [];
  const organizationSuggestions = data?.filter((suggestion) => suggestion.type === 'organization') ?? [];

  const onSelectSuggestion = (suggestion: UserSuggestion | OrganizationSuggestion) => {
    // Update recent searches with the search value
    updateRecentSearches(searchValue);
    if (suggestion.type === 'user') {
      navigate({
        to: '/user/$userIdentifier',
        resetScroll: false,
        params: {
          userIdentifier: suggestion.slug,
        },
      });
    } else if (suggestion.type === 'organization') {
      navigate({
        to: '/$organizationIdentifier/members',
        resetScroll: false,
        params: {
          organizationIdentifier: suggestion.slug,
        },
      });
    }

    dialog.remove(false);
  };

  useEffect(() => {
    if (scrollAreaRef.current) scrollAreaRef.current.scrollTop = 0;
  }, [data]);

  useEffect(() => {
    const calculateMaxVisibleItems = () => {
      if (scrollAreaRef.current) {
        const scrollAreaHeight = scrollAreaRef.current.clientHeight;
        const itemHeight = 44;
        return Math.floor(scrollAreaHeight / itemHeight);
      }
      return 0;
    };
    maxVisibleItemsRef.current = calculateMaxVisibleItems();
  }, []);

  const visibleUserSuggestions = userSuggestions.slice(0, maxVisibleItemsRef.current);
  const visibleOrganizationSuggestions = organizationSuggestions.slice(0, maxVisibleItemsRef.current);

  return (
    <Command className="rounded-lg border" shouldFilter={false}>
      <CommandInput
        value={searchValue}
        setZeroValue={setSearchValue}
        placeholder={t('common:placeholder.search')}
        onValueChange={(value) => {
          setSearchValue(value);
        }}
      />
      <ScrollArea id={'suggestion-search'} ref={scrollAreaRef} className="h-[30vh] overflow-y-auto">
        {isFetching && (
          <CommandLoading>
            <Loader2 className="text-muted-foreground h-6 w-6 mx-auto mt-2 animate-spin" />
          </CommandLoading>
        )}
        <CommandList>
          {recentSearches.length > 0 && userSuggestions.length < 1 && organizationSuggestions.length < 1 && (
            <>
              {searchValue.replaceAll(' ', '').length > 0 && <div className="py-4 text-center text-sm">{t('common:no_results_found')}</div>}
              <CommandGroup>
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground bg-[#0E0E11]">History</div>
                {recentSearches.map((search) => (
                  <CommandItem
                    key={search}
                    onSelect={() => {
                      setSearchValue(search);
                    }}
                    className="justify-between"
                  >
                    <div className="flex space-x-2 items-center outline-0 ring-0 group">
                      <History className="h-5 w-5" />
                      <span className="underline-offset-4 truncate font-medium">{search}</span>
                    </div>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        deleteItemFromList(search);
                      }}
                    >
                      <X className="h-5 w-5 opacity-70 hover:opacity-100" />
                    </button>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
          {/* {isFetching && (
          <CommandLoading>
            <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
          </CommandLoading>
        )} */}
          {userSuggestions.length > 0 && (
            <CommandGroup>
              <Sticky scrollElement="#suggestion-search-viewport" stickyClassName="z-10">
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground bg-[#0E0E11]">{t('common:user.plural')}</div>
              </Sticky>
              {visibleUserSuggestions.map((suggestion) => (
                <CommandItem key={suggestion.id} onSelect={() => onSelectSuggestion(suggestion)}>
                  <div className="flex space-x-2 items-center outline-0 ring-0 group">
                    <AvatarWrap type="user" className="h-8 w-8" id={suggestion.id} name={suggestion.name} url={suggestion.thumbnailUrl} />
                    <span className="group-hover:underline underline-offset-4 truncate font-medium">{suggestion.name}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {organizationSuggestions.length > 0 && userSuggestions.length > 0 && <CommandSeparator />}
          {organizationSuggestions.length > 0 && (
            <CommandGroup>
              <Sticky scrollElement="#suggestion-search-viewport" stickyClassName="z-10">
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground bg-[#0E0E11]">{t('common:organization.plural')}</div>
              </Sticky>
              {visibleOrganizationSuggestions.map((suggestion) => (
                <CommandItem key={suggestion.id} onSelect={() => onSelectSuggestion(suggestion)}>
                  <div className="flex space-x-2 items-center outline-0 ring-0 group">
                    <AvatarWrap type="organization" className="h-8 w-8" id={suggestion.id} name={suggestion.name} url={suggestion.thumbnailUrl} />
                    <span className="group-hover:underline underline-offset-4 truncate font-medium">{suggestion.name}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </ScrollArea>
    </Command>
  );
};
