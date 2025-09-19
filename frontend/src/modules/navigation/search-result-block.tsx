import { appConfig, ContextEntityType } from 'config';
import { User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ContextEntityBaseSchema, UserBaseSchema } from '~/api.gen';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import StickyBox from '~/modules/common/sticky-box';
import { Badge } from '~/modules/ui/badge';
import { CommandGroup, CommandItem, CommandSeparator } from '~/modules/ui/command';

type SearchBlockResult = ContextEntityBaseSchema | UserBaseSchema;

type SearchBlockProps = {
  results: SearchBlockResult[];
  entityType: ContextEntityType | 'user';
  onSelect: (item: SearchBlockResult) => void;
};

const contextEntities: readonly string[] = appConfig.contextEntityTypes;
export const SearchResultBlock = ({ results, entityType, onSelect }: SearchBlockProps) => {
  const { t } = useTranslation();
  const isContext = contextEntities.includes(entityType);

  if (!results.length) return null;

  return (
    <div key={entityType} className="flex flex-col gap-1 w-full">
      <CommandSeparator />
      <CommandGroup className="">
        <StickyBox className="z-10 px-2 py-1.5 text-xs font-medium text-muted-foreground bg-popover">
          {t(entityType, {
            ns: ['app', 'common'],
            defaultValue: entityType,
          })}
        </StickyBox>
        {results.map((item: SearchBlockResult) => {
          return (
            <CommandItem
              data-already-member={isContext && 'membership' in item && item.membership !== null}
              key={item.id}
              disabled={isContext && 'membership' in item && item.membership === null}
              className="w-full justify-between group"
              onSelect={() => onSelect(item)}
            >
              <div className="flex space-x-2 items-center outline-0 ring-0 group">
                <AvatarWrap type={entityType} className="h-8 w-8" id={item.id} name={item.name} url={item.thumbnailUrl} />
                <span className="group-data-[already-member=true]:hover:underline underline-offset-4 truncate font-medium">{item.name}</span>
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
    </div>
  );
};
