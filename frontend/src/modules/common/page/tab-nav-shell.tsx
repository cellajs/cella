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
  'focus-effect focus-inset group/tab text-muted-foreground standalone:[-webkit-touch-callout:none] hover:text-foreground focus-visible:text-foreground data-[active=true]:text-foreground relative rounded-sm px-2 py-3 font-medium transition-colors select-none last:mr-4 lg:px-4',
);

/** A tab's caption: a translation key, or `text` shown as written, such as an entity's name. */
export type TabLabel = { label: TKey } | { text: string };

type TabNavLabelProps = TabLabel & { icon?: ReactNode };

/** A tab's label, shortened in the middle past 20 characters. */
export function TabNavLabel({ icon, ...caption }: TabNavLabelProps) {
  const { t } = useTranslation();
  const text = 'text' in caption ? caption.text : t(caption.label);
  const shortText = truncateMiddle(text, 20);
  return (
    <span className={cn('group-active/tab:press block', icon && 'flex items-center gap-1.5')} title={shortText === text ? undefined : text}>
      {icon}
      {shortText}
    </span>
  );
}

interface TabNavShellProps {
  title?: string;
  avatar?: TabNavAvatar;
  className?: string;
  indicator?: TabIndicator;
  children: ReactNode;
}

/** Sticky shell of PageTabNav and LocalTabNav; container queries size the left cell, so it also works inside a sheet. */
export function TabNavShell({ title, avatar, className, indicator, children }: TabNavShellProps) {
  return (
    <StickyBox
      publishVar="--sticky-stack-nav"
      className={cn(
        'group/sticky bg-background after:bg-border @container z-80 grid grid-cols-[1fr_auto_1fr] pb-px after:absolute after:inset-x-3 after:bottom-0 after:h-px',
        className,
      )}
    >
      <div className="col-start-1 hidden min-w-max items-center transition-opacity duration-300 @2xl:group-data-[sticky=true]/sticky:flex starting:opacity-0">
        {avatar && (
          <EntityAvatar
            className="m-3 mr-2 size-5"
            type={avatar.type ?? 'organization'}
            id={avatar.id}
            name={avatar.name}
            url={avatar.thumbnailUrl}
          />
        )}
        {title && <div className="hidden max-w-42 truncate text-sm leading-5 font-semibold @4xl:block">{title}</div>}
      </div>
      <div className="no-scrollbar col-start-2 min-w-0 overflow-x-auto">
        <div className="relative flex min-w-max justify-center-safe gap-1 px-1">
          {indicator && <TabIndicatorBar indicator={indicator} />}
          {children}
        </div>
      </div>
    </StickyBox>
  );
}
