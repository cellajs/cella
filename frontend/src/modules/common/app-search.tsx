import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type OrganizationSuggestion, type UserSuggestion, getSuggestions } from '~/api/general';
import { dialog } from '~/modules/common/dialoger/state';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '~/modules/ui/command';
import { AvatarWrap } from './avatar-wrap';

export const AppSearch = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [value, setValue] = useState('');
  const [userSuggestions, setUserSuggestions] = useState<UserSuggestion[]>([]);
  const [organizationSuggestions, setOrganizationSuggestions] = useState<OrganizationSuggestion[]>([]);

  // TODO: why not using api wrapper here? Use entity type property
  useEffect(() => {
    getSuggestions(value).then((suggestions) => {
      setUserSuggestions(suggestions.filter((suggestion) => 'email' in suggestion) as UserSuggestion[]);
      setOrganizationSuggestions(suggestions.filter((suggestion) => !('email' in suggestion)) as OrganizationSuggestion[]);
    });
  }, [value]);

  const onSelectSuggestion = (suggestion: UserSuggestion | OrganizationSuggestion) => {
    // TODO: use type
    if ('email' in suggestion)
      navigate({
        to: '/user/$userIdentifier',
        params: {
          userIdentifier: suggestion.slug,
        },
      });
    else
      navigate({
        to: '/$organizationIdentifier/members',
        params: {
          organizationIdentifier: suggestion.slug,
        },
      });

    dialog.remove(false);
  };

  // TODO: UI improvements:
  // - Add loading spinner
  // - Add error handling
  // - height of suggestions should correspond to the height of the screen
  // - scroll to top when new suggestions are loaded
  // - use scrollarea
  // - sticky group type header
  return (
    <Command className="rounded-lg border shadow-md">
      <CommandInput
        placeholder={t('common:placeholder.search')}
        onValueChange={(value) => {
          setValue(value);
        }}
      />
      <CommandList>
        <CommandEmpty>{t('common:no_results_found')}</CommandEmpty>
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
        <CommandSeparator />
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
