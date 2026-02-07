import * as AvatarPrimitive from '@radix-ui/react-avatar';
import * as React from 'react';
import { cn } from '~/utils/cn';

export function Avatar({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Root>) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn('relative flex size-8 shrink-0 overflow-hidden', className)}
      {...props}
    />
  );
}

export function AvatarImage({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image data-slot="avatar-image" className={cn('aspect-square size-full', className)} {...props} />
  );
}

export function AvatarFallback({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn('bg-muted flex size-full items-center justify-center', className)}
      {...props}
    />
  );
}

type AvatarGroupContextValue = {
  count?: number;
  limit?: number;
  setCount?: React.Dispatch<React.SetStateAction<number>>;
};

const AvatarGroupContext = React.createContext<AvatarGroupContextValue>({});

function AvatarGroupProvider({ children, limit }: { children?: React.ReactNode; limit?: number }) {
  const [count, setCount] = React.useState<number>(0);

  return (
    <AvatarGroupContext.Provider
      value={{
        count,
        setCount,
        limit,
      }}
    >
      {children}
    </AvatarGroupContext.Provider>
  );
}

function useAvatarGroupContext() {
  return React.useContext(AvatarGroupContext);
}

export interface AvatarGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  limit?: number;
}

export const AvatarGroup = React.forwardRef<HTMLDivElement, AvatarGroupProps>(
  ({ children, className, limit, ...props }, ref) => {
    return (
      <AvatarGroupProvider limit={limit}>
        <div ref={ref} className={cn('flex items-center justify-end -space-x-2 relative', className)} {...props}>
          {children}
        </div>
      </AvatarGroupProvider>
    );
  },
);
AvatarGroup.displayName = 'AvatarGroup';

export function AvatarGroupList({ children }: { children?: React.ReactNode }) {
  const { limit, setCount } = useAvatarGroupContext();

  const childArray = React.Children.toArray(children);
  const count = childArray.length;

  React.useEffect(() => {
    setCount?.(count);
  }, [count, setCount]);

  if (!limit || count <= limit) {
    return <>{childArray}</>; // No overflow, show all
  }

  return <>{childArray.slice(0, limit - 1)}</>; // Reserve one spot for the overflow
}

export interface AvatarOverflowIndicatorProps extends React.HTMLAttributes<HTMLSpanElement> {}

export const AvatarOverflowIndicator = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement> & AvatarOverflowIndicatorProps
>(({ className, ...props }, ref) => {
  const { limit, count } = useAvatarGroupContext();
  // Determine if we need to display an additional avatar  or overflow
  if (!limit || !count || count <= limit) return null;
  // Show the overflow count
  return (
    <span
      ref={ref}
      className={cn(
        'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background shadow-xs',
        className,
      )}
      {...props}
    >
      +{count - limit + 1}
    </span>
  );
});
