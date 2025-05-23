import type { AvatarProps } from '@radix-ui/react-avatar';
import type { EntityType } from 'config';
import { memo, useMemo } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '~/modules/ui/avatar';
import { cn } from '~/utils/cn';
import { numberToColorClass } from '~/utils/number-to-color-class';

export interface AvatarWrapProps extends AvatarProps {
  id?: string;
  type?: EntityType;
  name?: string | null;
  url?: string | null;
  className?: string;
}

const AvatarWrap = memo(({ type, id, name, url, className, ...props }: AvatarWrapProps) => {
  const avatarBackground = useMemo(() => numberToColorClass(id), [id]);

  return (
    //key will force remounting of AvatarImage or AvatarFallback when URL changes
    <Avatar
      key={url ? 'image' : 'fallback'}
      {...props}
      data-type={type}
      className={cn('group bg-muted rounded-md data-[type=user]:rounded-full overflow-hidden', className)}
    >
      {url ? (
        <AvatarImage src={url} draggable="false" />
      ) : (
        <AvatarFallback className={avatarBackground}>
          <span className="sr-only">{name}</span>
          <div className="text-black opacity-80 flex h-full items-center justify-center">{name?.charAt(0).toUpperCase() || '-'}</div>
        </AvatarFallback>
      )}
    </Avatar>
  );
});

export { AvatarWrap };
