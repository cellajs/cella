import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { EntityType } from 'shared';
import type { TKey } from '~/lib/i18n-locales';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { type TabIndicator, TabIndicatorBar } from '~/modules/common/page/tab-indicator';
import { StickyBox } from '~/modules/common/sticky-box';
import { cn } from '~/utils/cn';
import { truncateMiddle } from '~/utils/truncate-middle';
import { tw } from '~/utils/tw';

export type TabNavAvatar = { id: string; thumbnailUrl?: string | null; name: string; type?: EntityType };

/** A tab of either bar: a link in PageTabNav, a button in LocalTabNav. */
export const tabNavItemClass = tw(
  'focus-effect focus-inset group/tab relative select-none rounded-sm px-2 py-3 font-medium text-muted-foreground transition-colors standalone:[-webkit-touch-callout:none] last:mr-4 hover:text-foreground focus-visible:text-foreground data-[active=true]:text-foreground lg:px-4',
);

interface TabNavLabelProps {
  label: TKey;
}

/** A tab's label, shortened in the middle past 20 characters. */
export function TabNavLabel({ label }: TabNavLabelProps) {
  const { t } = useTranslation();
  return <span className="group-active/tab:press block">{truncateMiddle(t(label), 20)}</span>;
}

interface TabNavShellProps {
  title?: string;
  avatar?: TabNavAvatar;
  className?: string;
  /** Active-tab underline, rendered in the track ahead of the tabs. */
  indicator?: TabIndicator;
  /** The tab links or buttons, rendered inside the scrolling track. */
  children: ReactNode;
}

/**
 * Sticky shell of PageTabNav and LocalTabNav. The side columns split the free space, so the tabs stay centered until the
 * stuck avatar and title need room; the right column gives way first, then the track scrolls from its first tab
 * (`justify-center-safe`). Container queries size the left cell, so the shell also works inside a sheet.
 */
export function TabNavShell({ title, avatar, className, indicator, children }: TabNavShellProps) {
  return (
    <StickyBox
      publishVar="--sticky-stack-nav"
      className={cn('group/sticky @container z-80 grid grid-cols-[1fr_auto_1fr] border-b bg-background', className)}
    >
      <div className="col-start-1 hidden min-w-max items-center starting:opacity-0 transition-opacity duration-300 @2xl:group-data-[sticky=true]/sticky:flex">
        {avatar && (
          <EntityAvatar className="m-3 size-5" type={avatar.type ?? 'organization'} id={avatar.id} name={avatar.name} url={avatar.thumbnailUrl} />
        )}
        {title && <div className="@4xl:block hidden max-w-42 truncate font-semibold text-sm leading-5">{title}</div>}
      </div>
      <div className="no-scrollbar col-start-2 min-w-0 overflow-x-auto">
        <div className="justify-center-safe relative flex min-w-max gap-1 px-1">
          {indicator && <TabIndicatorBar indicator={indicator} />}
          {children}
        </div>
      </div>
    </StickyBox>
  );
}
