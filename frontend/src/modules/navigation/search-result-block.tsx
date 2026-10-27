import { ChevronDownIcon, UserIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { UserBase } from 'sdk';
import { type ChannelEntityType, isChannel } from 'shared';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import type { EnrichedChannel } from '~/modules/entities/types';
import { Badge } from '~/modules/ui/badge';
import { ComboboxGroup, ComboboxItem, ComboboxSeparator } from '~/modules/ui/combobox';
import { cn } from '~/utils/cn';

type SearchResult = EnrichedChannel | UserBase;

interface SearchResultBlockProps {
  results: SearchResult[];
  entityType: ChannelEntityType | 'user';
  /** Hide the leading separator (used for the first visible group). */
  hideSeparator?: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export function SearchResultBlock({ results, entityType, hideSeparator = false, collapsed, onToggleCollapsed }: SearchResultBlockProps) {
  const { t } = useTranslation();
  const isChannelType = isChannel(entityType);

  if (!results.length) return null;

  return (
    <div className="flex w-full flex-col gap-1">
      {!hideSeparator && <ComboboxSeparator className="h-0 border-t border-dashed bg-transparent" />}
      <ComboboxGroup>
        <button
          type="button"
          className="group-label sticky top-0 z-10 -ml-1 flex w-[calc(100%+0.5rem)] items-center bg-popover/70 px-4 py-2 backdrop-blur-sm hover:text-foreground"
          onClick={onToggleCollapsed}
        >
          {t(entityType)}
          {collapsed && <span className="ml-3 font-normal text-faint-foreground">{results.length}</span>}
          <span className="grow" />
          <ChevronDownIcon className={cn('size-4 transition-transform', !collapsed && 'rotate-180')} />
        </button>
        {results.map((item) => (
          <ComboboxItem
            key={item.id}
            value={item}
            disabled={isChannelType && 'membership' in item && item.membership === null}
            data-already-member={isChannelType && 'membership' in item && item.membership !== null}
            className={cn('group justify-between', collapsed && 'hidden')}
          >
            <div className="flex min-w-0 items-center gap-2">
              <EntityAvatar type={entityType} className="size-8" id={item.id} name={item.name} url={item.thumbnailUrl} />
              <span className="link-decoration group-data-[already-member=true]:active:link-decoration-strong truncate font-medium group-data-[already-member=true]:hover:underline">
                {item.name}
              </span>
            </div>

            <div className="flex items-center">
              <Badge size="sm" variant="plain" className="hidden gap-1 group-data-[already-member=true]:flex">
                <UserIcon />
                <span className="max-sm:hidden">{t('c:member')}</span>
              </Badge>
            </div>
          </ComboboxItem>
        ))}
      </ComboboxGroup>
    </div>
  );
}
