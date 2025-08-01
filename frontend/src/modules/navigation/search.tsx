import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { appConfig, type EntityType } from 'config';
import { History, Search, User, X } from 'lucide-react';
import { Fragment, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import type { zGetPageEntitiesResponse } from '~/api.gen/zod.gen';
import useFocusByRef from '~/hooks/use-focus-by-ref';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import StickyBox from '~/modules/common/sticky-box';
import { entitiesQueryOptions } from '~/modules/entities/query';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '~/modules/ui/command';
import { ScrollArea } from '~/modules/ui/scroll-area';
import { getEntityRoute } from '~/nav-config';
import { useNavigationStore } from '~/store/navigation';

export type EntityListItem = z.infer<typeof zGetPageEntitiesResponse>['items'][number];

export interface EntitySearchSection {
  id: string;
  label: string;
  type: EntityType;
}

export const AppSearch = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);

  const [searchValue, setSearchValue] = useState('');

  const { recentSearches } = useNavigationStore();

  const { focusRef, setFocus } = useFocusByRef();

  const deleteItemFromList = (item: string) => {
    useNavigationStore.setState((state) => {
      const searches = [...state.recentSearches];
      const index = searches.indexOf(item);
      if (index === -1) return;
      searches.splice(index, 1);
      return { ...state, recentSearches: searches };
    });
  };

  const updateRecentSearches = (value: string) => {
    if (!value) return;
    if (value.replaceAll(' ', '').length < 3) return;
    const hasSubstringMatch = recentSearches.some((element) => element.toLowerCase().includes(value));
    if (hasSubstringMatch) return;
    useNavigationStore.setState((state) => {
      const searches = [...state.recentSearches];

      if (searches.includes(value)) {
        searches.splice(searches.indexOf(value), 1);
        searches.push(value);
      } else {
        searches.push(value);
        if (searches.length > 5) searches.shift();
      }
      return { ...state, recentSearches: searches };
    });
  };

  const { data: items, isFetching } = useQuery(entitiesQueryOptions({ q: searchValue }));

  const onSelectItem = (item: EntityListItem) => {
    // Update recent searches with the search value
    updateRecentSearches(searchValue);

    const { to, params, search } = getEntityRoute(item);
    navigate({ to, params, search, resetScroll: false });

    useDialoger.getState().remove();
  };

  useEffect(() => {
    if (scrollAreaRef.current) scrollAreaRef.current.scrollTop = 0;
  }, [items]);

  return (
    <Command className="rounded-lg shadow-2xl" shouldFilter={false}>
      <CommandInput
        value={searchValue}
        ref={focusRef}
        clearValue={() => {
          setSearchValue('');
          setFocus();
        }}
        className="h-12 text-lg"
        isSearching={isFetching}
        wrapClassName="text-lg"
        placeholder={t('common:placeholder.search')}
        onValueChange={(searchValue) => {
          const historyIndexes = recentSearches.map((_, index) => index);
          if (historyIndexes.includes(Number.parseInt(searchValue))) {
            setSearchValue(recentSearches[+searchValue]);
            return;
          }
          setSearchValue(searchValue);
        }}
      />
      <ScrollArea id={'item-search'} ref={scrollAreaRef} className="sm:h-[40vh] overflow-y-auto">
        {
          <CommandList className="h-full">
            {items.total === 0 && (
              <>
                {!!searchValue.length && !isFetching && (
                  <CommandEmpty className="h-full sm:h-[36vh]">
                    <ContentPlaceholder
                      icon={Search}
                      title={t('common:no_resource_found', {
                        resource: t('common:results').toLowerCase(),
                      })}
                    />
                  </CommandEmpty>
                )}
                {searchValue.length === 0 && (
                  <CommandEmpty className="h-full sm:h-[36vh]">
                    <ContentPlaceholder
                      icon={Search}
                      title={t('common:global_search.text', {
                        appName: appConfig.name,
                      })}
                    />
                  </CommandEmpty>
                )}
                {!!recentSearches.length && (
                  <CommandGroup>
                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground bg-popover">{t('common:history')}</div>
                    {recentSearches.map((search, index) => (
                      <CommandItem key={search} onSelect={() => setSearchValue(search)} className="justify-between">
                        <div className="flex gap-2 items-center outline-0 ring-0 group">
                          <History className="h-5 w-5" />
                          <span className="underline-offset-4 truncate font-medium">{search}</span>
                        </div>
                        <div className="flex items-center">
                          <span className="max-sm:hidden text-xs opacity-50 mx-3">{index}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="p-0 h-6 w-6"
                            onClick={(event) => {
                              event.stopPropagation();
                              deleteItemFromList(search);
                            }}
                          >
                            <X className="h-5 w-5 opacity-70 hover:opacity-100" />
                          </Button>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </>
            )}
            {items.total > 0 &&
              appConfig.pageEntityTypes.map((entityType) => {
                const filteredItems = items.items.filter((el) => el.entityType === entityType);
                // Skip rendering if no items match the section type
                if (filteredItems.length === 0) return null;

                return (
                  <Fragment key={entityType}>
                    <CommandSeparator />
                    <CommandGroup className="">
                      <StickyBox className="z-10 px-2 py-1.5 text-xs font-medium text-muted-foreground bg-popover">
                        {t(entityType, {
                          ns: ['app', 'common'],
                          defaultValue: entityType,
                        })}
                      </StickyBox>
                      {filteredItems.map((item: EntityListItem) => {
                        return (
                          <CommandItem
                            data-already-member={entityType !== 'user' && item.membership !== null}
                            key={item.id}
                            disabled={entityType !== 'user' && item.membership === null}
                            className="w-full justify-between group"
                            onSelect={() => onSelectItem(item)}
                          >
                            <div className="flex space-x-2 items-center outline-0 ring-0 group">
                              <AvatarWrap type={entityType} className="h-8 w-8" id={item.id} name={item.name} url={item.thumbnailUrl} />
                              <span className="group-data-[already-member=true]:hover:underline underline-offset-4 truncate font-medium">
                                {item.name}
                              </span>
                            </div>

                            <div className="flex items-center">
                              <Badge size="sm" variant="plain" className=" group-data-[already-member=true]:flex hidden gap-1">
                                <User size={14} />
                                <span className="max-sm:hidden font-light">{t('common:member')}</span>
                              </Badge>
                            </div>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </Fragment>
                );
              })}
          </CommandList>
        }
      </ScrollArea>
    </Command>
  );
};
