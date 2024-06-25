import { Check, ChevronsUpDown, Loader2, Search, X } from 'lucide-react';

import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useState } from 'react';
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover';
import { useQuery } from '@tanstack/react-query';
import { useDebounce } from '~/hooks/use-debounce';
import { Command, CommandInput, CommandLoading, CommandEmpty, CommandItem, CommandList, CommandGroup } from '../ui/command';
import { getSuggestions } from '~/api/general';
import { ScrollArea } from '../ui/scroll-area';
import { AvatarWrap } from './avatar-wrap';
import ContentPlaceholder from './content-placeholder';
import { config } from 'config';
import { useMeasure } from '~/hooks/use-measure';
import { Badge } from '../ui/badge';

export function QueryCombobox({ onChange, value }: { value: string[]; onChange: (items: string[]) => void }) {
  const { t } = useTranslation();
  const { ref, bounds } = useMeasure();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
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

  const { data, isLoading: isLoadingOrig } = useQuery({
    queryKey: ['search', debouncedSearchQuery],
    queryFn: () => getSuggestions(debouncedSearchQuery, 'USER'),
    enabled: !!debouncedSearchQuery,
  });
  // To get around this https://github.com/TanStack/query/issues/3584
  const isLoading = !!debouncedSearchQuery && isLoadingOrig;

  useEffect(() => {
    onChange(selected);
  }, [selected]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          ref={ref as React.LegacyRef<HTMLDivElement>}
          className="rounded-md w-full flex relative items-center flex-wrap gap-1 border border-input bg-background active:!translate-y-0 hover:transparent p-2"
        >
          {value?.length ? (
            value?.map((el) => (
              <Badge
                variant="secondary"
                key={el}
                className="data-[disabled]:bg-muted-foreground data-[disabled]:text-muted data-[disabled]:hover:bg-muted-foreground data-[fixed]:bg-muted-foreground data-[fixed]:text-muted data-[fixed]:hover:bg-muted-foreground"
              >
                {el}
                <button
                  type="button"
                  className="py-1 m-[-4px] ml-1 rounded-full outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2"
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
            <span className="text-sm">{t('common:search_users')}</span>
          )}
          <ChevronsUpDown className="absolute right-0 mx-2 h-4 w-4 shrink-0 opacity-50" />
        </div>
      </PopoverTrigger>

      <PopoverContent align="start" style={{ width: `${bounds.left + bounds.right + 2}px` }} className={'p-0'}>
        <Command shouldFilter={false}>
          <CommandInput value={searchQuery} onValueChange={setSearchQuery} clearValue={setSearchQuery} placeholder={t('common:search_users')} />
          <ScrollArea className="h-[50vh] sm:h-[40vh] overflow-y-auto">
            {isLoading && (
              <CommandLoading>
                <Loader2 className="text-muted-foreground h-6 w-6 mx-auto mt-2 animate-spin" />
              </CommandLoading>
            )}
            <CommandList className="px-1 h-full">
              {!data || data.items.length === 0 ? (
                <>
                  {debouncedSearchQuery.length ? (
                    <CommandEmpty className="h-full">
                      <ContentPlaceholder Icon={Search} title={t('common:no_resource_found', { resource: t('common:users').toLowerCase() })} />
                    </CommandEmpty>
                  ) : (
                    <CommandEmpty className="h-full">
                      <ContentPlaceholder title={t('common:invite_members_search.text', { appName: config.name })} />
                    </CommandEmpty>
                  )}
                </>
              ) : (
                <CommandGroup>
                  {data.items.map((user) => (
                    <CommandItem
                      key={user.id}
                      className="w-full justify-between"
                      onSelect={() => {
                        if (user.email) onSelect(user.email);
                      }}
                    >
                      <div className="flex space-x-2 items-center outline-0 ring-0 group">
                        <AvatarWrap type={user.entity} className="h-8 w-8" id={user.id} name={user.name} url={user.thumbnailUrl} />
                        <span className="group-hover:underline underline-offset-4 truncate font-medium">{user.name}</span>
                      </div>
                      <Check size={16} className={`text-success ${selected.some((el) => el === user.email) ? 'opacity-100' : 'opacity-0'}`} />
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </ScrollArea>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
