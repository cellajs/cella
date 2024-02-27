import { AvatarProps } from '@radix-ui/react-avatar';
import { memo, useMemo } from 'react';
import { getColorClass } from '~/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '~/modules/ui/avatar';

export interface AvatarWrapProps extends AvatarProps {
  id?: string;
  type?: 'user' | 'organization';
  name?: string | null;
  url?: string | null;
  className?: string;
}

const AvatarWrap = memo(({ type, id, name, url, className, ...props }: AvatarWrapProps) => {
  const avatarBackground = useMemo(() => getColorClass(id), [id]);

  return (
    <Avatar {...props} className={`${type === 'user' ? 'rounded-full' : 'rounded-md'} ${className} ${avatarBackground}`}>
      {url ? (
        <AvatarImage src={`${url}?width=100&format=avif`} />
      ) : (
        <AvatarFallback>
          <span className="sr-only">{name}</span>
          <div className={`text-black/50 flex h-full items-center justify-center ${avatarBackground}`}>{name?.charAt(0).toUpperCase() || '-'}</div>
        </AvatarFallback>
      )}
    </Avatar>
  );
});

export { AvatarWrap };
