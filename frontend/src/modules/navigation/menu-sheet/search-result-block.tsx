import { ChevronDownIcon, UserIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { UserBase } from 'sdk';
import { type ChannelEntityType, isChannel } from 'shared';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import type { EnrichedChannel } from '~/modules/entities/types';
import { Badge } from '~/modules/ui/badge';
import { ComboboxGroup, ComboboxItem, ComboboxSeparator } from '~/modules/ui/combobox';

type SearchBlockResult = EnrichedChannel | UserBase;

type SearchBlockProps = {
  results: SearchBlockResult[];
  entityType: ChannelEntityType | 'user';
  /** Hide the leading separator (used for the first visible group). */
  hideSeparator?: boolean;
};

export const SearchResultBlock = ({ results, entityType, hideSeparator = false }: SearchBlockProps) => {
  const { t } = useTranslation();
  const isChannelType = isChannel(entityType);
  const [collapsed, setCollapsed] = useState(false);

  if (!results.length) return null;

  return (
    <div key={entityType} className="flex w-full flex-col gap-1">
      {!hideSeparator && <ComboboxSeparator className="h-0 border-border border-t border-dashed bg-transparent" />}
      <ComboboxGroup>
        <button
          type="button"
          className="sticky top-0 z-10 -ml-1 flex w-[calc(100%+0.5rem)] items-center bg-popover/70 px-3 py-2 font-medium text-muted-foreground text-sm backdrop-blur-sm hover:text-foreground"
          onClick={() => setCollapsed(!collapsed)}
        >
          {t(entityType)}
          {collapsed && <span className="ml-3 opacity-70">{results.length}</span>}
          <span className="grow" />
          <ChevronDownIcon className={`size-4 transition-transform ${!collapsed && 'rotate-180'}`} />
        </button>
        {results.map((item: SearchBlockResult) => {
          return (
            <ComboboxItem
              key={item.id}
              value={item}
              disabled={isChannelType && 'membership' in item && item.membership === null}
              data-already-member={isChannelType && 'membership' in item && item.membership !== null}
              className={`group w-full justify-between ${collapsed && 'hidden'}`}
            >
              <div className="group flex items-center space-x-2 outline-0 ring-0">
                <EntityAvatar
                  type={entityType}
                  className="h-8 w-8"
                  id={item.id}
                  name={item.name}
                  url={item.thumbnailUrl}
                />
                <span className="truncate font-medium underline-offset-4 group-data-[already-member=true]:hover:underline">
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
          );
        })}
      </ComboboxGroup>
    </div>
  );
};
