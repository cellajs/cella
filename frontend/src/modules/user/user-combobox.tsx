import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { UsersRoundIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChannelBase } from 'sdk';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { useDebounce } from '~/hooks/use-debounce';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { StatusDot, tileTones } from '~/modules/common/expandable-tile';
import { InlineLinkButton } from '~/modules/common/inline-link-button';
import { MiddleCut } from '~/modules/common/middle-cut';
import { inviteCheckQueryOptions } from '~/modules/memberships/query';
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from '~/modules/ui/combobox';
import { focusOnMount } from '~/modules/user/invite-result';
import { usersListQueryOptions } from '~/modules/user/query';
import { outcomeView } from '~/modules/user/use-invite-check';
import type { InvitePerson } from '~/modules/user/use-invite-list';
import { cn } from '~/utils/cn';

interface UserComboboxProps {
  /** Addresses already in the list, which the results leave out. */
  chosen: string[];
  onPick: (person: InvitePerson) => void;
  channel: ChannelBase & { organizationId?: string };
  autoFocus?: boolean;
  /** Without a match, a way to invite by address. */
  onToEmail: () => void;
}

/** Search people by name. A pick leaves the field empty for the next search. */
export function UserCombobox({ chosen, onPick, channel, autoFocus, onToEmail }: UserComboboxProps) {
  const { t } = useTranslation();
  const isMobile = useBreakpointBelow('sm');

  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const highlightedRef = useRef<string | undefined>(undefined);

  const { data, isFetching } = useInfiniteQuery(usersListQueryOptions({ q: debouncedSearchQuery }));
  const items = (data?.pages.flatMap((page) => page.items) ?? []).filter(({ email }) => !chosen.includes(email.toLowerCase()));

  // The same check as typed addresses: a member is left out, one invited before shows when
  const resultEmails = items.map((user) => user.email.toLowerCase()).sort();
  const { data: outcomes } = useQuery({ ...inviteCheckQueryOptions(channel, resultEmails), placeholderData: keepPreviousData });
  const outcomeByEmail = new Map((outcomes ?? []).map((outcome) => [outcome.email, outcome]));
  const isLeftOut = (email: string) => {
    const outcome = outcomeByEmail.get(email.toLowerCase());
    return !!outcome && outcomeView(outcome, t).group === 'out';
  };

  const pick = (person?: (typeof items)[number]) => {
    if (person) onPick({ ...person, outcome: outcomeByEmail.get(person.email.toLowerCase()) });
    setSearchQuery('');
  };

  return (
    <Combobox<string>
      items={items.map((user) => user.email)}
      itemToStringLabel={(email) => email}
      itemToStringValue={(email) => email}
      value={null}
      onValueChange={(email) => pick(items.find((user) => user.email === email))}
      onItemHighlighted={(email) => {
        highlightedRef.current = email;
      }}
      inputValue={searchQuery}
      onInputValueChange={(value, { reason }) => {
        // Picking fills the input with the pick's label, and the field empties for the next one
        if (reason !== 'item-press') setSearchQuery(value);
      }}
      filter={() => true}
    >
      <ComboboxInput
        ref={autoFocus ? focusOnMount : undefined}
        placeholder={t('c:search_users')}
        showTrigger={false}
        className="w-full"
        autoCapitalize="none"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="enter"
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          // Without a highlighted result it would submit the surrounding form
          event.preventDefault();
          // Results arrive after the typing stops, too late for the combobox to highlight the first
          const isCurrent = searchQuery && searchQuery === debouncedSearchQuery && !isFetching;
          if (isCurrent && !highlightedRef.current) pick(items.find(({ email }) => !isLeftOut(email)));
        }}
      />

      <ComboboxContent>
        <ComboboxList>
          <ComboboxEmpty>
            {isFetching ? null : debouncedSearchQuery.length ? (
              <p className="p-2">
                {t('c:invite_search_none')} <InlineLinkButton onClick={onToEmail}>{t('c:invite_by_email')}</InlineLinkButton>
              </p>
            ) : (
              <ContentPlaceholder icon={UsersRoundIcon} title="c:invite_search_empty" />
            )}
          </ComboboxEmpty>
          {items.map(({ id, name, email, entityType, thumbnailUrl }) => {
            const outcome = outcomeByEmail.get(email.toLowerCase());
            const view = outcome ? outcomeView(outcome, t) : null;
            return (
              <ComboboxItem key={id} value={email} disabled={isLeftOut(email)} className="group/user-item justify-between">
                <div className="flex min-w-0 items-center gap-2">
                  <EntityAvatar type={entityType} className="size-8" id={id} name={name} url={thumbnailUrl} />
                  <span className="link-decoration group-active/user-item:link-decoration-strong truncate font-medium group-hover/user-item:underline">
                    {isMobile ? <MiddleCut text={email} /> : name}
                  </span>
                </div>

                <div className="flex min-w-0 items-center gap-2">
                  {view && view.group !== 'new' ? (
                    <span className="flex shrink-0 items-center gap-1.5 text-sm">
                      <StatusDot tone={view.tone} />
                      <span className={cn('font-medium max-sm:hidden', tileTones[view.tone].text)}>{view.word}</span>
                    </span>
                  ) : (
                    <MiddleCut text={email} className="max-sm:hidden" />
                  )}
                </div>
              </ComboboxItem>
            );
          })}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
