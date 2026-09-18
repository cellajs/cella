import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import type { EntityType } from 'shared';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { StickyBox } from '~/modules/common/sticky-box';
import { cn } from '~/utils/cn';

export type TabNavAvatar = {
  id: string;
  thumbnailUrl?: string | null;
  name: string;
  type?: EntityType;
};

interface Props {
  title?: string;
  avatar?: TabNavAvatar;
  className?: string;
  /** The tab links or buttons, rendered inside the scrolling track. */
  children: ReactNode;
}

/**
 * Sticky shell shared by PageTabNav and LocalTabNav: a three-column grid whose side columns
 * split the free space, so the tabs stay centered on the bar until the stuck avatar and title
 * need the room. Then only the right column gives way, and once it is gone the track scrolls
 * from the first tab with `justify-center-safe`. Container queries size the left cell, so the
 * same shell works inside a sheet: avatar from `@2xl`, title from `@4xl`.
 */
export function TabNavShell({ title, avatar, className, children }: Props) {
  return (
    <StickyBox
      publishVar="--sticky-stack-nav"
      className={cn(
        'group/sticky @container/tab-nav z-80 grid grid-cols-[1fr_auto_1fr] border-b bg-background/75 backdrop-blur-xs',
        className,
      )}
    >
      <div className="col-start-1 hidden min-w-max items-center starting:opacity-0 transition-opacity duration-300 @2xl:group-data-[sticky=true]/sticky:flex">
        {avatar && (
          <EntityAvatar
            className="m-3 h-5 w-5 text-xs"
            type={avatar.type ?? 'organization'}
            id={avatar.id}
            name={avatar.name}
            url={avatar.thumbnailUrl}
          />
        )}
        {title && <div className="@4xl:block hidden max-w-42 truncate font-semibold text-sm leading-5">{title}</div>}
      </div>
      <motion.div
        layout="position"
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="scrollbar-none col-start-2 min-w-0 overflow-x-auto [&::-webkit-scrollbar]:hidden"
      >
        <div className="justify-center-safe flex min-w-max gap-1 px-1">{children}</div>
      </motion.div>
    </StickyBox>
  );
}
