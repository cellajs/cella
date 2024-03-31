import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type OrganizationSuggestion, type UserSuggestion, getSuggestions } from '~/api/general';
import { dialog } from '~/modules/common/dialoger/state';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandLoading, CommandSeparator } from '~/modules/ui/command';
import { AvatarWrap } from './avatar-wrap';

export const AppSearch = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [value, setValue] = useState('');

  const { data, isFetching } = useQuery({
    queryKey: ['search', value],
    queryFn: () => getSuggestions(value),
    enabled: value.length > 0,
  });

  const userSuggestions = data?.filter((suggestion) => 'email' in suggestion) ?? [];
  const organizationSuggestions = data?.filter((suggestion) => !('email' in suggestion)) ?? [];

  const onSelectSuggestion = (suggestion: UserSuggestion | OrganizationSuggestion) => {
    // TODO: use type
    if ('email' in suggestion) {
      navigate({
        to: '/user/$userIdentifier',
        resetScroll: false,
        params: {
          userIdentifier: suggestion.slug,
        },
      });
    } else {
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

  // TODO: UI improvements
  return (
    <Command className="rounded-lg border" shouldFilter={false}>
      <CommandInput
        placeholder={t('common:placeholder.search')}
        onValueChange={(value) => {
          setValue(value);
        }}
      />
      <CommandList>
        <CommandEmpty>
          {isFetching ? (
            <CommandLoading>
              <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
            </CommandLoading>
          ) : (
            t('common:no_results_found')
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
