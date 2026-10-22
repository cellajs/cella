import { Avatar as AvatarPrimitive } from '@base-ui/react/avatar';
import * as React from 'react';
import { cn } from '~/utils/cn';

export interface AvatarProps extends AvatarPrimitive.Root.Props {
  size?: 'default' | 'sm' | 'lg';
}

export function Avatar({ className, size = 'default', ...props }: AvatarProps) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      data-size={size}
      className={cn('group/avatar relative flex size-8 shrink-0 select-none overflow-hidden data-[size=lg]:size-10 data-[size=sm]:size-6', className)}
      {...props}
    />
  );
}

export function AvatarImage({ className, ...props }: AvatarPrimitive.Image.Props) {
  return <AvatarPrimitive.Image data-slot="avatar-image" className={cn('aspect-square size-full object-cover', className)} {...props} />;
}

export function AvatarFallback({ className, ...props }: AvatarPrimitive.Fallback.Props) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn('flex size-full items-center justify-center bg-muted text-muted-foreground group-data-[size=sm]/avatar:text-xs', className)}
      {...props}
    />
  );
}

interface AvatarGroupContextValue {
  count?: number;
  limit?: number;
  setCount?: React.Dispatch<React.SetStateAction<number>>;
}

const AvatarGroupContext = React.createContext<AvatarGroupContextValue>({});

export interface AvatarGroupProps extends React.ComponentProps<'div'> {
  /** Most items shown, the overflow pill included. */
  limit?: number;
}

export function AvatarGroup({ children, className, limit, ...props }: AvatarGroupProps) {
  const [count, setCount] = React.useState(0);

  return (
    <AvatarGroupContext.Provider value={{ count, setCount, limit }}>
      <div className={cn('relative flex items-center justify-end -space-x-2', className)} {...props}>
        {children}
      </div>
    </AvatarGroupContext.Provider>
  );
}

export function AvatarGroupList({ children }: { children?: React.ReactNode }) {
  const { limit, setCount } = React.useContext(AvatarGroupContext);

  const childArray = React.Children.toArray(children);
  const count = childArray.length;

  React.useEffect(() => {
    setCount?.(count);
  }, [count, setCount]);

  if (!limit || count <= limit) {
    return <>{childArray}</>;
  }

  return <>{childArray.slice(0, limit - 1)}</>; // Reserve one spot for the overflow
}

export function AvatarOverflowIndicator({ className, ...props }: React.ComponentProps<'span'>) {
  const { limit, count } = React.useContext(AvatarGroupContext);
  if (!limit || !count || count <= limit) return null;
  return (
    <span className={cn('relative flex size-10 shrink-0 items-center justify-center rounded-full bg-background shadow-xs', className)} {...props}>
      +{count - limit + 1}
    </span>
  );
}
