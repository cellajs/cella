import { useQuery } from '@tanstack/react-query';
import { ChevronDownIcon, UserIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { UserBase } from 'sdk';
import { type ChannelEntityType, isChannel } from 'shared';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { HighlightText } from '~/modules/common/match-highlight/highlight-text';
import { SearchRecentRemoveButton } from '~/modules/common/search-clear-button';
import type { EnrichedChannel } from '~/modules/entities/types';
import { myMembershipsQueryOptions } from '~/modules/me/query';
import { Badge } from '~/modules/ui/badge';
import { ComboboxGroup, ComboboxItem, ComboboxSeparator } from '~/modules/ui/combobox';
import { findMembership } from '~/query/enrichment/helpers';
import { cn } from '~/utils/cn';

type SearchResult = EnrichedChannel | UserBase;

interface SearchResultBlockProps {
  results: SearchResult[];
  entityType: ChannelEntityType | 'user';
  label?: string;
  hideSeparator?: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** Gives each row a remove button in place of the member badge. */
  onRemove?: (item: SearchResult) => void;
}

export function SearchResultBlock({
  results,
  entityType,
  label,
  hideSeparator = false,
  collapsed,
  onToggleCollapsed,
  onRemove,
}: SearchResultBlockProps) {
  const { t } = useTranslation();
  const isChannelType = isChannel(entityType);
  const { data: myMemberships } = useQuery(myMembershipsQueryOptions());

  if (!results.length) return null;

  return (
    <div className="flex w-full flex-col gap-1">
      {!hideSeparator && <ComboboxSeparator className="h-0 border-t border-dashed bg-transparent" />}
      <ComboboxGroup>
        <button
          type="button"
          className="group-label bg-popover hover:text-foreground sticky top-0 z-10 -ml-1 flex w-[calc(100%+0.5rem)] items-center px-4 py-2 text-xs"
          onClick={onToggleCollapsed}
        >
          {label ?? t(entityType)}
          {collapsed && <span className="text-faint-foreground ml-3 font-normal">{results.length}</span>}
          <span className="grow" />
          <ChevronDownIcon className={cn('size-4 transition-transform', !collapsed && 'rotate-180')} />
        </button>
        {results.map((item) => (
          <ComboboxItem
            key={item.id}
            value={item}
            data-already-member={isChannelType && !!findMembership(myMemberships?.results ?? [], item.id)}
            className={cn('group group/recent justify-between', collapsed && 'hidden')}
          >
            <div className="flex min-w-0 items-center gap-2">
              <EntityAvatar type={entityType} className="size-8" id={item.id} name={item.name} url={item.thumbnailUrl} />
              <span className="link-decoration group-data-[already-member=true]:active:link-decoration-strong truncate font-medium group-data-[already-member=true]:hover:underline">
                <HighlightText text={item.name} />
              </span>
            </div>

            <div className="flex items-center">
              {onRemove ? (
                <SearchRecentRemoveButton onRemove={() => onRemove(item)} />
              ) : (
                <Badge size="sm" soft className="hidden gap-1 group-data-[already-member=true]:flex">
                  <UserIcon />
                  <span className="max-sm:hidden">{t('c:member')}</span>
                </Badge>
              )}
            </div>
          </ComboboxItem>
        ))}
      </ComboboxGroup>
    </div>
  );
}
