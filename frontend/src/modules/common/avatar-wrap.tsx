import type { AvatarProps } from '@radix-ui/react-avatar';
import { memo, useMemo } from 'react';
import { cn, getColorClass } from '~/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '~/modules/ui/avatar';
import type { ResourceType } from '~/types';

export interface AvatarWrapProps extends AvatarProps {
  id?: string;
  type: ResourceType;
  name?: string | null;
  url?: string | null;
  className?: string;
}

const AvatarWrap = memo(({ type, id, name, url, className, ...props }: AvatarWrapProps) => {
  const avatarBackground = useMemo(() => getColorClass(id), [id]);

  return (
    <Avatar {...props} className={className}>
      {url ? (
        <AvatarImage src={`${url}?width=100&format=avif`} className={type === 'user' ? 'rounded-full' : 'rounded-md'} />
      ) : (
        <AvatarFallback className={cn(avatarBackground, type === 'user' ? 'rounded-full' : 'rounded-md')}>
          <span className="sr-only">{name}</span>
          <div className={'text-black/50 flex h-full items-center justify-center'}>{name?.charAt(0).toUpperCase() || '-'}</div>
        </AvatarFallback>
      )}
    </Avatar>
  );
});

export { AvatarWrap };
