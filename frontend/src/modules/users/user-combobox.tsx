import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { appConfig } from 'config';
import { Check, ChevronsUpDown, Search, User, Users2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useDebounce } from '~/hooks/use-debounce';
import { useMeasure } from '~/hooks/use-measure';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import type { EntityPage } from '~/modules/entities/types';
import { Badge } from '~/modules/ui/badge';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '~/modules/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '~/modules/ui/popover';
import { ScrollArea } from '~/modules/ui/scroll-area';
import { searchUsersQueryOptions } from './query';

interface Props {
  value: string[];
  onChange: (items: string[]) => void;
  entity: EntityPage;
}

export const UserCombobox = ({ value, onChange, entity }: Props) => {
  const { t } = useTranslation();
  const isMobile = useBreakpoints('max', 'sm');
  const { ref, bounds } = useMeasure<HTMLDivElement>();
  const entityIdField = appConfig.entityIdFields[entity.entityType];

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(value);
  const [searchQuery, setSearchQuery] = useState('');

  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  const handleUnselect = (item: string) => {
    const index = selected.findIndex((i) => i === item);
    setSelected((prevSelected) => {
      const updatedSelected = [...prevSelected];
      updatedSelected.splice(index, 1); // Remove 1 element at index
      return updatedSelected;
    });
  };

  const handleSetActive = useCallback(
    (item: string) => {
      if (selected.includes(item)) return handleUnselect(item);
      setSelected((prevSelected) => [...prevSelected, item]);
    },
    [selected],
  );

  const onSelect = (item: string) => {
    handleSetActive(item);
    setSearchQuery('');
    setOpen(false);
  };

  const queryOptions = searchUsersQueryOptions({ q: debouncedSearchQuery, targetEntityId: entity.id, targetEntityType: entity.entityType });
  const { data, isFetching } = useQuery({
    ...queryOptions,
    initialData: { items: [], total: 0 },
    staleTime: 0,
    enabled: debouncedSearchQuery.trim().length > 0, // to avoid issues with spaces
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    onChange(selected);
  }, [selected]);

  const variants = {
    hidden: { opacity: 0, y: -5, scale: 0.98 },
    visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.1 } },
    exit: { opacity: 0, y: -5, scale: 0.98, transition: { duration: 0.1 } },
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          ref={ref}
          className="rounded-md w-full flex relative items-center flex-wrap gap-1 border border-input bg-background active:translate-y-0! hover:transparent p-1.5 min-h-10 cursor-pointer pr-10"
        >
          {value?.length ? (
            value?.map((el) => (
              <Badge
                size="sm"
                variant="secondary"
                key={el}
                className="data-disabled:bg-muted-foreground data-disabled:text-muted data-disabled:hover:bg-muted-foreground data-fixed:bg-muted-foreground data-fixed:text-muted data-fixed:hover:bg-muted-foreground max-w-60"
              >
                <span className="truncate">{el}</span>
                <button
                  type="button"
                  className="py-1 m-[-.25rem] ml-1 rounded-full outline-hidden sm:ring-offset-background sm:focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleUnselect(el);
                  }}
                >
                  <X className="h-4 w-4 opacity-50 hover:opacity-100" />
                </button>
              </Badge>
            ))
          ) : (
            <span className="text-sm ml-1">{t('common:search_users')}</span>
          )}
          <ChevronsUpDown className="absolute right-0 mx-2 h-4 w-4 shrink-0 opacity-50" />
        </div>
      </PopoverTrigger>

      <PopoverContent align="start" style={{ width: `${bounds.left + bounds.right + 36}px` }} className={'p-0'}>
        <Command shouldFilter={false}>
          <CommandInput
            value={searchQuery}
            onValueChange={setSearchQuery}
            clearValue={setSearchQuery}
            isSearching={isFetching}
            placeholder={t('common:placeholder.type_name')}
          />

          <CommandList className="px-1 h-full">
            <AnimatePresence mode="wait">
              {!isFetching && !data.items.length ? (
                <motion.div key="empty-state" initial="hidden" animate="visible" exit="exit" variants={variants} className="h-full">
                  {debouncedSearchQuery.length ? (
                    <CommandEmpty>
                      <ContentPlaceholder icon={Search} title={t('common:no_resource_found', { resource: t('common:users').toLowerCase() })} />
                    </CommandEmpty>
                  ) : (
                    <CommandEmpty>
                      <ContentPlaceholder icon={Users2} title={t('common:invite_members_search.text', { appName: appConfig.name })} />
                    </CommandEmpty>
                  )}
                </motion.div>
              ) : (
                data.items.length > 0 && (
                  <motion.div
                    key="results"
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    variants={variants}
                    className="max-h-[30vh] overflow-y-auto"
                  >
                    <ScrollArea>
                      <CommandGroup>
                        {data.items.map(({ id, name, email, memberships, entityType, thumbnailUrl }) => {
                          const alreadyMember = !!memberships.find((m) => m[entityIdField] === entity.id);
                          const disabled = !memberships || alreadyMember;
                          return (
                            <CommandItem
                              data-was-selected={selected.some((u) => u === email)}
                              data-already-member={alreadyMember}
                              disabled={disabled}
                              key={id}
                              className="w-full justify-between group"
                              onSelect={() => onSelect(email)}
                            >
                              <div className="flex space-x-2 items-center outline-0 ring-0 group">
                                <AvatarWrap type={entityType} className="h-8 w-8" id={id} name={name} url={thumbnailUrl} />
                                <span className="group-hover:underline group-data-[already-member=true]:no-underline underline-offset-4 truncate font-medium">
                                  {isMobile ? email : name}
                                </span>
                              </div>

                              <div className="flex items-center gap-2 min-w-0">
                                <Badge size="sm" variant="plain" className="group-data-[already-member=true]:flex hidden gap-1">
                                  <User size={14} />
                                  <span className="max-sm:hidden font-light">{t('common:already_member')}</span>
                                </Badge>
                                <Check size={16} strokeWidth={3} className="flex text-success group-data-[was-selected=false]:hidden" />
                                <span className="font-light max-sm:hidden group-data-[already-member=true]:hidden group-data-[was-selected=true]:hidden">
                                  {email}
                                </span>
                              </div>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </ScrollArea>
                  </motion.div>
                )
              )}
            </AnimatePresence>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
