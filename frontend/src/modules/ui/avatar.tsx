import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '~/utils/cn';

const Avatar = React.forwardRef<React.ComponentRef<typeof AvatarPrimitive.Root>, React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>>(
  ({ className, ...props }, ref) => <AvatarPrimitive.Root ref={ref} className={cn('relative flex h-10 w-10 shrink-0', className)} {...props} />,
);
Avatar.displayName = AvatarPrimitive.Root.displayName;

const AvatarImage = React.forwardRef<React.ComponentRef<typeof AvatarPrimitive.Image>, React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>>(
  ({ className, ...props }, ref) => <AvatarPrimitive.Image ref={ref} className={cn('aspect-square h-full w-full', className)} {...props} />,
);
AvatarImage.displayName = AvatarPrimitive.Image.displayName;

const AvatarFallback = React.forwardRef<
  React.ComponentRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback ref={ref} className={cn('flex h-full w-full items-center justify-center', className)} {...props} />
));
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;

const avatarBadgeVariants = cva('absolute w-4 h-4 rounded-full bg-background flex items-stretch justify-stretch *:grow *:rounded-full', {
  variants: {
    position: {
      bottomLeft: 'bottom-0 -left-1',
      bottomRight: 'bottom-0 -right-1',
      topLeft: 'top-0 -left-1',
      topRight: 'top-0 -right-1',
    },
  },
  defaultVariants: {
    position: 'bottomLeft',
  },
});

export interface AvatarBadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof avatarBadgeVariants> {
  // biome-ignore lint/suspicious/noExplicitAny: unable to infer type due to dynamic data structure
  children?: React.ReactElement<any, string | React.JSXElementConstructor<any>> | null | never[];
}

const AvatarBadge = ({ className, position, ...props }: AvatarBadgeProps) => (
  <div className={cn(avatarBadgeVariants({ position }), className)} {...props} />
);

type AvatarGroupContextValue = {
  count?: number;
  limit?: number;
  setCount?: React.Dispatch<React.SetStateAction<number>>;
};

const AvatarGroupContext = React.createContext<AvatarGroupContextValue>({});

const AvatarGroupProvider = ({ children, limit }: { children?: React.ReactNode; limit?: number }) => {
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
};

const useAvatarGroupContext = () => React.useContext(AvatarGroupContext);

export interface AvatarGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  limit?: number;
}

const AvatarGroup = React.forwardRef<HTMLDivElement, AvatarGroupProps>(({ children, className, limit, ...props }, ref) => {
  return (
    <AvatarGroupProvider limit={limit}>
      <div ref={ref} className={cn('flex items-center justify-end -space-x-2 relative', className)} {...props}>
        {children}
      </div>
    </AvatarGroupProvider>
  );
});
AvatarGroup.displayName = 'AvatarGroup';

const AvatarGroupList = ({ children }: { children?: React.ReactNode }) => {
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
};

export interface AvatarOverflowIndicatorProps extends React.HTMLAttributes<HTMLSpanElement> {}

const AvatarOverflowIndicator = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement> & AvatarOverflowIndicatorProps>(
  ({ className, ...props }, ref) => {
    const { limit, count } = useAvatarGroupContext();
    // Determine if we need to display an additional avatar  or overflow
    if (!limit || !count || count <= limit) return null;
    // Show the overflow count
    return (
      <span
        ref={ref}
        className={cn('relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background shadow-xs', className)}
        {...props}
      >
        +{count - limit + 1}
      </span>
    );
  },
);
AvatarOverflowIndicator.displayName = 'AvatarOverflowIndicator';

export { Avatar, AvatarBadge, AvatarFallback, AvatarGroup, AvatarGroupList, AvatarImage, AvatarOverflowIndicator };
