import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { UsersRoundIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChannelBase } from 'sdk';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { useDebounce } from '~/hooks/use-debounce';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { StatusDot, tileTones } from '~/modules/common/expandable-tile';
import { InlineLinkButton } from '~/modules/common/inline-link-button';
import { MiddleCut } from '~/modules/common/middle-cut';
import { SearchResultsSkeleton } from '~/modules/common/search-results-skeleton';
import { SearchSpinner } from '~/modules/common/search-spinner';
import { inviteCheckQueryOptions } from '~/modules/memberships/query';
import { Badge } from '~/modules/ui/badge';
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxItemIndicator, ComboboxList } from '~/modules/ui/combobox';
import { skipPasswordManagers } from '~/modules/ui/input';
import { InputGroupAddon } from '~/modules/ui/input-group';
import { focusOnMount } from '~/modules/user/invite-result';
import { usersListQueryOptions } from '~/modules/user/query';
import { outcomeView } from '~/modules/user/use-invite-check';
import type { InvitePerson } from '~/modules/user/use-invite-list';
import { cn } from '~/utils/cn';

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

/** Search people by name or email. A press adds or removes, the search stays open, and its text is selected for the next. */
export function UserCombobox({ chosen, onPick, onRemove, channel, autoFocus, onToEmail }: UserComboboxProps) {
  const { t } = useTranslation();
  const isMobile = useBreakpointBelow('sm');

  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const inputRef = useRef<HTMLInputElement | null>(null);
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
  const { data, isFetching } = useInfiniteQuery({ ...usersListQueryOptions({ q: debouncedSearchQuery }), placeholderData: keepPreviousData });
  const items = (data?.pages.flatMap((page) => page.items) ?? []).map((user) => ({ ...user, email: user.email.toLowerCase() }));

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
    requestAnimationFrame(() => inputRef.current?.select());
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
      onOpenChange={(open, details) => {
        if (!open && details.reason === 'item-press') details.cancel();
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
        ref={(node) => {
          inputRef.current = node;
          if (autoFocus) focusOnMount(node);
        }}
        placeholder={t('c:placeholder.name_or_email')}
        showTrigger={false}
        // Visual only: the option's selected state already tells a screen reader
        detail={
          notice && (
            <Badge key={notice.count} aria-hidden variant={notice.added ? 'success' : 'secondary'} soft className="fade-in-0 zoom-in-95 animate-in">
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
          <SearchSpinner hasSearch={!!searchQuery} isSearching={isFetching} />
        </InputGroupAddon>
      </ComboboxInput>

      <ComboboxContent>
        {!data && <SearchResultsSkeleton />}
        <ComboboxList>
          <ComboboxEmpty>
            {!data ? null : debouncedSearchQuery.length ? (
              <p className="p-2">
                {t('c:invite_search_none')} <InlineLinkButton onClick={onToEmail}>{t('c:invite_by_email')}</InlineLinkButton>
              </p>
            ) : (
              <ContentPlaceholder icon={UsersRoundIcon} title="c:invite_search_empty" />
            )}
          </ComboboxEmpty>
          {items.map(({ id, name, email, entityType, thumbnailUrl }) => {
            const outcome = outcomeByEmail.get(email);
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
                  <ComboboxItemIndicator asRemove={highlighted === email && toggled !== email} />
                </div>
              </ComboboxItem>
            );
          })}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
