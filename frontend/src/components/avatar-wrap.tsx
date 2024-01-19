import { AvatarProps } from '@radix-ui/react-avatar';
import { memo, useMemo } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar';
import { generateNumber } from '~/lib/utils';

export interface AvatarWrapProps extends AvatarProps {
  id?: string;
  type?: 'user' | 'organization';
  name?: string | null;
  url?: string | null;
  className?: string;
}

const colors = [
  'bg-blue-300',
  'bg-lime-300',
  'bg-orange-300',
  'bg-yellow-300',
  'bg-green-300',
  'bg-teal-300',
  'bg-indigo-300',
  'bg-purple-300',
  'bg-pink-300',
  'bg-red-300',
];

const getColorClass = (id?: string) => {
  if (!id) return 'bg-gray-300';

  const index = generateNumber(id) || 0;
  return colors[index];
};

const AvatarWrap = memo(({ type, id, name, url, className, ...props }: AvatarWrapProps) => {
  const bgClass = useMemo(() => (url ? 'bg-background' : getColorClass(id)), [url, id]);

  return (
    <Avatar {...props} className={`${type === 'user' ? 'rounded-full' : 'rounded-md'} ${className} ${bgClass}`}>
      {url ? (
        <AvatarImage src={url} />
      ) : (
        <AvatarFallback>
          <span className="sr-only">{name}</span>
          <div className={`text-black/50 flex h-full items-center justify-center ${bgClass}`}>{name?.charAt(0).toUpperCase() || '-'}</div>
        </AvatarFallback>
      )}
    </Avatar>
  );
});

export { AvatarWrap };
