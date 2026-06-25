import { useInfiniteQuery } from '@tanstack/react-query';
import { ChevronsUpDownIcon, SearchIcon, UserIcon, Users2Icon, XIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ContextEntityBase } from 'sdk';
import { appConfig } from 'shared';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { useDebounce } from '~/hooks/use-debounce';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { membersListQueryOptions } from '~/modules/memberships/query';
import { Badge } from '~/modules/ui/badge';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxPrimitive,
  ComboboxSearchInput,
} from '~/modules/ui/combobox';
import { ScrollArea } from '~/modules/ui/scroll-area';
import { usersListQueryOptions } from '~/modules/user/query';

interface Props {
  value: string[];
  onValueChange: (items: string[]) => void;
  contextEntity: ContextEntityBase & { organizationId?: string };
}

export const UserCombobox = ({ value, onValueChange, contextEntity }: Props) => {
  const { t } = useTranslation();
  const isMobile = useBreakpointBelow('sm');
  const nameLabel = t('c:name').toLowerCase();

  const [searchQuery, setSearchQuery] = useState('');

  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  const handleUnselect = (item: string) => {
    onValueChange(value.filter((v) => v !== item));
  };

  const queryOptions = usersListQueryOptions({ q: debouncedSearchQuery });

  const { data, isFetching } = useInfiniteQuery(queryOptions);

  const items = data?.pages.flatMap((p) => p.items) ?? [];
  const userIds = items.map((u) => u.id).join(',');

  // Fetch membership status only for users in search results
  const { data: membersData } = useInfiniteQuery({
    ...membersListQueryOptions({
      entityId: contextEntity.id,
      entityType: contextEntity.entityType,
      tenantId: contextEntity.tenantId,
      organizationId: contextEntity.organizationId || contextEntity.id,
      userIds,
    }),
    enabled: items.length > 0,
  });

  const existingMemberIds = new Set(membersData?.pages.flatMap((p) => p.items.map((m) => m.id)) ?? []);

  const variants = {
    hidden: { opacity: 0, y: -5, scale: 0.98 },
    visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.1 } },
    exit: { opacity: 0, y: -5, scale: 0.98, transition: { duration: 0.1 } },
  };

  return (
    <Combobox<string, true>
      multiple
      items={items.map((u) => u.email)}
      itemToStringLabel={(v) => v}
      itemToStringValue={(v) => v}
      value={value}
      onValueChange={onValueChange}
      inputValue={searchQuery}
      onInputValueChange={setSearchQuery}
      filter={() => true}
    >
      <ComboboxPrimitive.Trigger
        render={
          <button
            type="button"
            className="hover:transparent relative flex min-h-10 w-full cursor-pointer flex-wrap items-center gap-1 rounded-md border border-input bg-background p-1.5 pr-10 text-left active:translate-y-0!"
          />
        }
      >
        {value?.length ? (
          value.map((el) => (
            <Badge
              size="sm"
              variant="secondary"
              key={el}
              className="max-w-60 data-disabled:bg-muted-foreground data-fixed:bg-muted-foreground data-disabled:text-muted-foreground/50 data-fixed:text-muted data-disabled:hover:bg-muted-foreground data-fixed:hover:bg-muted-foreground"
            >
              <span className="truncate">{el}</span>
              {/* biome-ignore lint/a11y/useSemanticElements: a native <button> cannot be nested inside the trigger <button>; this is an intentional removable-chip control. */}
              <span
                role="button"
                tabIndex={0}
                aria-label={t('c:remove')}
                className="focus-effect -m-1 ml-1 rounded-full py-1"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleUnselect(el);
                }}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return;
                  e.preventDefault();
                  e.stopPropagation();
                  handleUnselect(el);
                }}
              >
                <XIcon className="size-4 opacity-50 hover:opacity-100" />
              </span>
            </Badge>
          ))
        ) : (
          <span className="ml-1 text-sm">{t('c:search_users')}</span>
        )}
        <ChevronsUpDownIcon className="absolute right-0 mx-2 size-4 shrink-0 opacity-50" />
      </ComboboxPrimitive.Trigger>

      <ComboboxContent className="p-0">
        <ComboboxSearchInput
          value={searchQuery}
          isSearching={isFetching}
          placeholder={t('c:placeholder.type_input', { inputLabel: nameLabel })}
        />
        <ComboboxList className="h-full px-1">
          <AnimatePresence mode="wait">
            {!isFetching && !items.length ? (
              <motion.div
                key="empty-state"
                initial="hidden"
                animate="visible"
                exit="exit"
                variants={variants}
                className="h-full"
              >
                {debouncedSearchQuery.length ? (
                  <ComboboxEmpty>
                    <ContentPlaceholder
                      icon={SearchIcon}
                      title="c:no_resource_found"
                      titleProps={{ resource: t('c:users').toLowerCase() }}
                    />
                  </ComboboxEmpty>
                ) : (
                  <ComboboxEmpty>
                    <ContentPlaceholder
                      icon={Users2Icon}
                      title="c:invite_members_search.text"
                      titleProps={{ appName: appConfig.name }}
                    />
                  </ComboboxEmpty>
                )}
              </motion.div>
            ) : (
              items.length > 0 && (
                <motion.div
                  key="results"
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  variants={variants}
                  className="max-h-[30vh] overflow-y-auto"
                >
                  <ScrollArea>
                    {items.map(({ id, name, email, entityType, thumbnailUrl }) => {
                      const alreadyMember = existingMemberIds.has(id);
                      return (
                        <ComboboxItem
                          key={id}
                          value={email}
                          disabled={alreadyMember}
                          data-was-selected={value.some((u) => u === email)}
                          data-already-member={alreadyMember}
                          className="group w-full justify-between"
                        >
                          <div className="group flex items-center space-x-2 outline-0 ring-0">
                            <EntityAvatar
                              type={entityType}
                              className="h-8 w-8"
                              id={id}
                              name={name}
                              url={thumbnailUrl}
                            />
                            <span className="truncate font-medium underline-offset-4 group-hover:underline group-data-[already-member=true]:no-underline">
                              {isMobile ? email : name}
                            </span>
                          </div>

                          <div className="flex min-w-0 items-center gap-2">
                            <Badge
                              size="sm"
                              variant="plain"
                              className="hidden gap-1 group-data-[already-member=true]:flex"
                            >
                              <UserIcon size={14} />
                              <span className="max-sm:hidden">{t('c:already_member')}</span>
                            </Badge>
                            <span className="group-data-[already-member=true]:hidden group-data-[was-selected=true]:hidden max-sm:hidden">
                              {email}
                            </span>
                          </div>
                        </ComboboxItem>
                      );
                    })}
                  </ScrollArea>
                </motion.div>
              )
            )}
          </AnimatePresence>
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
};
