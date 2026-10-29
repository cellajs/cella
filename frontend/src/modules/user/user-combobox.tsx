import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ClockIcon, SearchIcon, UserIcon, UsersRoundIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChannelBase } from 'sdk';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { useDebounce } from '~/hooks/use-debounce';
import { ComboboxSearchInput } from '~/modules/common/combobox-search-input';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { InputTriggerChevron } from '~/modules/common/form-fields/input-trigger-button';
import { MiddleCut } from '~/modules/common/middle-cut';
import { inviteCheckQueryOptions } from '~/modules/memberships/query';
import { Badge } from '~/modules/ui/badge';
import { Chip } from '~/modules/ui/chip';
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
import { inviteNote } from '~/modules/user/use-invite-check';

const contentVariants = {
  hidden: { opacity: 0, y: -5, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.1 } },
  exit: { opacity: 0, y: -5, scale: 0.98, transition: { duration: 0.1 } },
};

interface UserComboboxProps {
  value: string[];
  onChange: (emails: string[]) => void;
  channel: ChannelBase & { organizationId?: string };
}

export function UserCombobox({ value, onChange, channel }: UserComboboxProps) {
  const { t } = useTranslation();
  const isMobile = useBreakpointBelow('sm');

  const [searchQuery, setSearchQuery] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);

  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // A removed chip unmounts its focused remove button, so focus goes to the trigger and not to the page
  const handleUnselect = (email: string) => {
    onChange(value.filter((selected) => selected !== email));
    triggerRef.current?.focus();
  };

  const { data, isFetching } = useInfiniteQuery(usersListQueryOptions({ q: debouncedSearchQuery }));

  const items = data?.pages.flatMap((page) => page.items) ?? [];

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
      onValueChange={onChange}
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
          {value.length ? (
            value.map((email) => (
              <Chip key={email} onRemove={() => handleUnselect(email)} removeLabel={t('c:remove_resource', { resource: email })} className="max-w-60">
                <MiddleCut text={email} />
              </Chip>
            ))
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
                    <ContentPlaceholder icon={UsersRoundIcon} title="c:invite_members_search.text" />
                  )}
                </ComboboxEmpty>
              </motion.div>
            ) : (
              items.length > 0 && (
                <motion.div key="results" initial="hidden" animate="visible" exit="exit" variants={contentVariants}>
                  {items.map(({ id, name, email, entityType, thumbnailUrl }) => {
                    const outcome = outcomeByEmail.get(email.toLowerCase());
                    const alreadyMember = outcome?.outcome === 'member';
                    const invitedNote = outcome?.outcome === 'remind' ? inviteNote(outcome, t) : undefined;
                    return (
                      <ComboboxItem key={id} value={email} disabled={alreadyMember} className="group/user-item justify-between">
                        <div className="flex min-w-0 items-center gap-2">
                          <EntityAvatar type={entityType} className="size-8" id={id} name={name} url={thumbnailUrl} />
                          <span className="link-decoration group-active/user-item:link-decoration-strong truncate font-medium group-hover/user-item:underline">
                            {isMobile ? <MiddleCut text={email} /> : name}
                          </span>
                        </div>

                        <div className="flex min-w-0 items-center gap-2">
                          <Badge size="sm" soft className="hidden group-data-disabled/user-item:flex">
                            <UserIcon />
                            <span className="max-sm:hidden">{t('c:already_member')}</span>
                          </Badge>
                          {invitedNote && (
                            <Badge size="sm" soft>
                              <ClockIcon />
                              <span className="max-sm:hidden">{invitedNote}</span>
                            </Badge>
                          )}
                          <MiddleCut
                            text={email}
                            className="group-data-disabled/user-item:hidden group-data-selected/user-item:hidden max-sm:hidden"
                          />
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
