import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Loader2, History, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type OrganizationSuggestion, type UserSuggestion, getSuggestions } from '~/api/general';
import { useDebounce } from '~/hooks/use-debounce';
import { dialog } from '~/modules/common/dialoger/state';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandLoading, CommandSeparator } from '~/modules/ui/command';
import { useNavigationStore } from '~/store/navigation';
import { AvatarWrap } from './avatar-wrap';

export const AppSearch = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [value, setValue] = useState('');

  const debouncedValue = useDebounce(value, 500);
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

  const updateRecentSearches = (newValue: string) => {
    if (newValue.replaceAll(' ', '') === '') return;
    const hasSubstringMatch = recentSearches.some(element => element.toLowerCase().includes(newValue));
    if(hasSubstringMatch) return;
    
    if (recentSearches.includes(newValue)) return;
    useNavigationStore.setState((state) => {
      const searches = [...state.recentSearches];

      if (searches.includes(newValue)) {
        searches.splice(searches.indexOf(newValue), 1);
        searches.push(newValue);
      } else {
        searches.push(newValue);
        if (searches.length > 5) searches.shift();
      }
      return { ...state, recentSearches: searches };
    });
  };

  const { data, isFetching } = useQuery({
    queryKey: ['search', value],
    queryFn: () => getSuggestions(value),
    enabled: value.length > 0,
  });

  const userSuggestions = data?.filter((suggestion) => suggestion.type === 'user') ?? [];
  const organizationSuggestions = data?.filter((suggestion) => suggestion.type === 'organization') ?? [];

  const onSelectSuggestion = (suggestion: UserSuggestion | OrganizationSuggestion) => {
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
    updateRecentSearches(debouncedValue);
  }, [debouncedValue]);

  return (
    <Command className="rounded-lg border" shouldFilter={false}>
      <CommandInput
        value={value}
        placeholder={t('common:placeholder.search')}
        onValueChange={(value) => {
          setValue(value);
        }}
      />
      <CommandList>
        <CommandEmpty>
          {isFetching ? (
            <CommandLoading>
              <Loader2 className="text-muted-foreground h-6 w-6 mx-auto mt-2 animate-spin" />
            </CommandLoading>
          ) : (
            <>
              {value.replaceAll(' ', '').length > 0 && t('common:no_results_found')}
              {recentSearches.length > 0 && (
                <div className="flex flex-col">
                  <span className="text-start  py-1 px-2 text-muted-foreground font-medium text-xs">History</span>
                  {recentSearches.map((search) => (
                    <button
                      type="button"
                      key={search}
                      onClick={() => {
                        setValue(search);
                      }}
                      className="relative flex justify-between cursor-pointer select-none h-11 items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
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
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </CommandEmpty>
        {/* {isFetching && (
          <CommandLoading>
            <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
          </CommandLoading>
        )} */}
        {userSuggestions.length > 0 && (
          <CommandGroup heading={t('common:user.plural')}>
            {userSuggestions.map((suggestion) => (
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
          <CommandGroup heading={t('common:organization.plural')}>
            {organizationSuggestions.map((suggestion) => (
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
    </Command>
  );
};
