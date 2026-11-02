import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { SearchIcon, UsersRoundIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChannelBase } from 'sdk';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { useDebounce } from '~/hooks/use-debounce';
import { ComboboxSearchInput } from '~/modules/common/combobox-search-input';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { StatusDot, tileTones } from '~/modules/common/expandable-tile';
import { InputTriggerChevron } from '~/modules/common/form-fields/input-trigger-button';
import { MiddleCut } from '~/modules/common/middle-cut';
import { inviteCheckQueryOptions } from '~/modules/memberships/query';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxList,
  ComboboxPrimitive,
} from '~/modules/ui/combobox';
import { usersListQueryOptions } from '~/modules/user/query';
import { InviteChip } from '~/modules/user/select-emails';
import { type InviteCheck, outcomeView } from '~/modules/user/use-invite-check';
import { cn } from '~/utils/cn';

const contentVariants = {
  hidden: { opacity: 0, y: -5, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.1 } },
  exit: { opacity: 0, y: -5, scale: 0.98, transition: { duration: 0.1 } },
};

type SearchedUser = { id: string; name: string; email: string; entityType: 'user'; thumbnailUrl?: string | null };

interface UserComboboxProps {
  value: string[];
  onChange: (emails: string[]) => void;
  /** Text another mode kept that holds no address; this mode can only remove it. */
  unparsed: string[];
  onRemoveUnparsed: (text: string) => void;
  channel: ChannelBase & { organizationId?: string };
  check: InviteCheck;
}

export function UserCombobox({ value, onChange, unparsed, onRemoveUnparsed, channel, check }: UserComboboxProps) {
  const { t } = useTranslation();
  const isMobile = useBreakpointBelow('sm');

  const [searchQuery, setSearchQuery] = useState('');
  // Who a chosen address belongs to, so its chip shows the person picked; one restored from a draft stays an address.
  const [chosenUsers, setChosenUsers] = useState<Map<string, SearchedUser>>(new Map());
  const triggerRef = useRef<HTMLButtonElement>(null);

  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // A removed chip unmounts its focused remove button, so focus goes to the trigger and not to the page
  const handleUnselect = (email: string) => {
    onChange(value.filter((selected) => selected !== email));
    triggerRef.current?.focus();
  };

  const handleRemoveUnparsed = (text: string) => {
    onRemoveUnparsed(text);
    triggerRef.current?.focus();
  };

  const { data, isFetching } = useInfiniteQuery(usersListQueryOptions({ q: debouncedSearchQuery }));

  const items = data?.pages.flatMap((page) => page.items) ?? [];

  const handleValueChange = (emails: string[]) => {
    const next = new Map(chosenUsers);
    for (const user of items) if (emails.includes(user.email)) next.set(user.email, user);
    setChosenUsers(next);
    onChange(emails);
  };

  // The same check as typed addresses: a member is left out, one invited before shows when
  const resultEmails = items.map((user) => user.email.toLowerCase()).sort();
  const { data: outcomes } = useQuery({ ...inviteCheckQueryOptions(channel, resultEmails), placeholderData: keepPreviousData });
  const outcomeByEmail = new Map((outcomes ?? []).map((outcome) => [outcome.email, outcome]));

  return (
    <Combobox<string, true>
      multiple
      items={items.map((user) => user.email)}
      itemToStringLabel={(email) => email}
      itemToStringValue={(email) => email}
      value={value}
      onValueChange={handleValueChange}
      inputValue={searchQuery}
      onInputValueChange={setSearchQuery}
      filter={() => true}
    >
      <div className="relative flex min-h-10 w-full items-center rounded-md border border-input bg-background p-1.5 pr-10">
        {/* Lies behind the chip row, whose remove buttons cannot nest in a button, and reads out the selection itself */}
        <ComboboxPrimitive.Trigger
          ref={triggerRef}
          render={<button type="button" className="focus-effect absolute inset-0 cursor-pointer rounded-md" />}
        >
          <span className="sr-only">{value.length ? value.join(', ') : t('c:search_users')}</span>
        </ComboboxPrimitive.Trigger>
        <div className="pointer-events-none relative flex min-w-0 flex-wrap items-center gap-1">
          {unparsed.map((text) => (
            <InviteChip key={text} address={text} view={check.viewOf(text)} onRemove={() => handleRemoveUnparsed(text)} />
          ))}
          {value.length || unparsed.length ? (
            value.map((email) => {
              const user = chosenUsers.get(email);
              return (
                <InviteChip
                  key={email}
                  address={email}
                  view={check.viewOf(email)}
                  onRemove={() => handleUnselect(email)}
                  start={
                    user && <EntityAvatar type={user.entityType} className="size-6 text-xs" id={user.id} name={user.name} url={user.thumbnailUrl} />
                  }
                >
                  {user?.name}
                </InviteChip>
              );
            })
          ) : (
            <span aria-hidden="true" className="ml-1 text-sm">
              {t('c:search_users')}
            </span>
          )}
        </div>
        <InputTriggerChevron className="pointer-events-none absolute right-0 mx-2" />
      </div>

      <ComboboxContent>
        <ComboboxSearchInput
          value={searchQuery}
          onClear={() => setSearchQuery('')}
          isSearching={isFetching}
          placeholder={t('c:placeholder.type_input', { inputLabel: t('c:name') })}
        />
        <ComboboxList>
          <AnimatePresence mode="wait">
            {!isFetching && !items.length ? (
              <motion.div key="empty-state" initial="hidden" animate="visible" exit="exit" variants={contentVariants}>
                <ComboboxEmpty>
                  {debouncedSearchQuery.length ? (
                    <ContentPlaceholder icon={SearchIcon} title="c:no_resource_found" titleOptions={{ resource: t('c:user_other') }} />
                  ) : (
                    <ContentPlaceholder icon={UsersRoundIcon} title="c:invite_hint_search" />
                  )}
                </ComboboxEmpty>
              </motion.div>
            ) : (
              items.length > 0 && (
                <motion.div key="results" initial="hidden" animate="visible" exit="exit" variants={contentVariants}>
                  {items.map(({ id, name, email, entityType, thumbnailUrl }) => {
                    const outcome = outcomeByEmail.get(email.toLowerCase());
                    const view = outcome ? outcomeView(outcome, t) : null;
                    return (
                      <ComboboxItem key={id} value={email} disabled={view?.group === 'out'} className="group/user-item justify-between">
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
                            <MiddleCut text={email} className="group-data-selected/user-item:hidden max-sm:hidden" />
                          )}
                          <ComboboxItemIndicator />
                        </div>
                      </ComboboxItem>
                    );
                  })}
                </motion.div>
              )
            )}
          </AnimatePresence>
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
