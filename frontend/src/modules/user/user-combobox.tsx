import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { CheckIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChannelBase } from 'sdk';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { useDebounce } from '~/hooks/use-debounce';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { tileTones } from '~/modules/common/expandable-tile';
import { InlineLinkButton } from '~/modules/common/inline-link-button';
import { MiddleCut } from '~/modules/common/middle-cut';
import { SearchResultsSkeleton } from '~/modules/common/search-results-skeleton';
import { SearchSpinner } from '~/modules/common/search-spinner';
import { StatusDot } from '~/modules/common/status-dot';
import { inviteCheckQueryOptions } from '~/modules/memberships/query';
import { Badge } from '~/modules/ui/badge';
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxItemIndicator, ComboboxList } from '~/modules/ui/combobox';
import { skipPasswordManagers } from '~/modules/ui/input';
import { InputGroupAddon } from '~/modules/ui/input-group';
import { usersListQueryOptions } from '~/modules/user/query';
import { outcomeView } from '~/modules/user/use-invite-check';
import type { InvitePerson } from '~/modules/user/use-invite-list';
import { cn } from '~/utils/cn';
import { focusOnMount } from '~/utils/focus-on-mount';

// How long the field names the last add or remove
const noticeDuration = 5000;

interface UserComboboxProps {
  /** Addresses already in the list, lowercased, which the results show checked. */
  chosen: string[];
  onPick: (person: InvitePerson) => void;
  onRemove: (address: string) => void;
  channel: ChannelBase & { organizationId?: string };
  autoFocus?: boolean;
  /** Without a match, a way to invite by address. */
  onToEmail: () => void;
}

/** Search people by name or email. A press adds or removes and clears the search for the next. */
export function UserCombobox({ chosen, onPick, onRemove, channel, autoFocus, onToEmail }: UserComboboxProps) {
  const { t } = useTranslation();
  const isMobile = useBreakpointBelow('sm');

  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  // Results wait for the first typed character: an empty field suggests nobody
  const [open, setOpen] = useState(false);
  const hasSearch = !!searchQuery.trim();
  const [highlighted, setHighlighted] = useState<string>();
  // The row a press just changed shows its new state until the highlight leaves it
  const [toggled, setToggled] = useState<string>();
  // Each add or remove is a new count, which shows the badge again and restarts its time
  const [notice, setNotice] = useState<{ added: boolean; count: number } | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), noticeDuration);
    return () => clearTimeout(timer);
  }, [notice]);

  // The last results stay while the next arrive, so the popup keeps its height as the search changes
  const { data, isFetching } = useInfiniteQuery({
    ...usersListQueryOptions({ q: debouncedSearchQuery }),
    enabled: !!debouncedSearchQuery.trim(),
    placeholderData: keepPreviousData,
  });
  // An anonymous account has no address to invite by, so it is left out
  const items = (data?.pages.flatMap((page) => page.results) ?? []).flatMap((user) =>
    user.email ? [{ ...user, email: user.email.toLowerCase() }] : [],
  );

  // The same check as typed addresses: a member is left out, one invited before shows when
  const resultEmails = items.map((user) => user.email).sort();
  const { data: outcomes } = useQuery({ ...inviteCheckQueryOptions(channel, resultEmails), placeholderData: keepPreviousData });
  const outcomeByEmail = new Map((outcomes ?? []).map((outcome) => [outcome.email, outcome]));
  const isLeftOut = (email: string) => {
    const outcome = outcomeByEmail.get(email);
    return !!outcome && outcomeView(outcome, t).group === 'out';
  };

  const afterToggle = (email: string, added: boolean) => {
    setToggled(email);
    setNotice((current) => ({ added, count: (current?.count ?? 0) + 1 }));
    setSearchQuery('');
  };

  const pick = (person?: (typeof items)[number]) => {
    if (!person) return;
    onPick({ ...person, outcome: outcomeByEmail.get(person.email) });
    afterToggle(person.email, true);
  };

  const toggle = (next: string[]) => {
    const added = next.find((email) => !chosen.includes(email));
    if (added) return pick(items.find((user) => user.email === added));
    const removed = chosen.find((email) => !next.includes(email));
    if (!removed) return;
    onRemove(removed);
    afterToggle(removed, false);
  };

  return (
    <Combobox<string, true>
      multiple
      items={items.map((user) => user.email)}
      itemToStringLabel={(email) => email}
      itemToStringValue={(email) => email}
      value={chosen}
      onValueChange={toggle}
      open={open && hasSearch}
      onOpenChange={(next, details) => {
        // A press clears the search itself: the combobox's own clear would end the badge with it
        if (!next && details.reason === 'item-press') return details.cancel();
        setOpen(next);
      }}
      onItemHighlighted={(email) => {
        setHighlighted(email);
        if (email !== toggled) setToggled(undefined);
      }}
      inputValue={searchQuery}
      onInputValueChange={(value) => {
        setSearchQuery(value);
        // A new search is past the last add or remove
        setNotice(null);
      }}
      filter={() => true}
    >
      <ComboboxInput
        ref={autoFocus ? focusOnMount : undefined}
        placeholder={t('c:placeholder.name_or_email')}
        showTrigger={false}
        // Visual only: the option's selected state already tells a screen reader
        detail={
          notice && (
            <Badge key={notice.count} aria-hidden variant={notice.added ? 'success' : 'secondary'} soft className="mount-fade">
              {t(notice.added ? 'c:invite_person_added' : 'c:invite_person_removed')}
            </Badge>
          )
        }
        className="w-full"
        autoCapitalize="none"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="enter"
        {...skipPasswordManagers}
        onBlur={() => setNotice(null)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          // Without a highlighted result it would submit the surrounding form
          event.preventDefault();
          // Results arrive after the typing stops, too late for the combobox to highlight the first
          const isCurrent = searchQuery && searchQuery === debouncedSearchQuery && !isFetching;
          if (isCurrent && !highlighted) pick(items.find(({ email }) => !isLeftOut(email) && !chosen.includes(email)));
        }}
      >
        <InputGroupAddon>
          <SearchSpinner hasSearch={hasSearch} isSearching={isFetching} />
        </InputGroupAddon>
      </ComboboxInput>

      <ComboboxContent>
        {!data && <SearchResultsSkeleton />}
        <ComboboxList>
          <ComboboxEmpty>
            {data && !!debouncedSearchQuery.trim() && (
              <p className="p-2">
                {t('c:invite_search_none')} <InlineLinkButton onClick={onToEmail}>{t('c:invite_by_email')}</InlineLinkButton>
              </p>
            )}
          </ComboboxEmpty>
          {items.map(({ id, name, email, entityType, thumbnailUrl }) => {
            const outcome = outcomeByEmail.get(email);
            const view = outcome ? outcomeView(outcome, t) : null;
            const hasState = !!view && view.group !== 'new';
            const isMember = outcome?.outcome === 'member';
            return (
              <ComboboxItem key={id} value={email} disabled={isLeftOut(email)} className="group/user-item justify-between">
                <div className="flex min-w-0 items-center gap-2">
                  <EntityAvatar type={entityType} className="size-8" id={id} name={name} url={thumbnailUrl} />
                  <span className="link-decoration group-active/user-item:link-decoration-strong truncate font-medium group-hover/user-item:underline">
                    {isMobile ? <MiddleCut text={email} /> : name}
                  </span>
                </div>

                {/* A state keeps its width, so the address beside it truncates */}
                <div className={cn('flex min-w-0 items-center gap-2', hasState && 'shrink-0')}>
                  {view && hasState ? (
                    <span className="flex shrink-0 items-center gap-1.5 text-sm">
                      {!isMember && <StatusDot variant={view.tone} pulse={false} />}
                      <span className={cn('font-medium', tileTones[view.tone].text)}>{view.word}</span>
                    </span>
                  ) : (
                    <MiddleCut text={email} className="max-sm:hidden" />
                  )}
                  {/* In the column of a picked row's check, in the word's color: in already, not by this invite */}
                  {isMember ? (
                    <CheckIcon aria-hidden className="text-muted-foreground size-4 shrink-0 pointer-coarse:size-5" />
                  ) : (
                    <ComboboxItemIndicator asRemove={highlighted === email && toggled !== email} />
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
