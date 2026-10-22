import { useRef } from 'react';
import type { TKey } from '~/lib/i18n-locales';
import { ActiveTabMarker, useTabIndicator } from '~/modules/common/page/tab-indicator';
import { type TabNavAvatar, TabNavLabel, TabNavShell, tabNavItemClass } from '~/modules/common/page/tab-nav-shell';
import { getScrollParent } from '~/modules/common/sticky-box';

export type LocalTab = { id: string; label: TKey };

interface LocalTabNavProps {
  tabs: LocalTab[];
  activeId: string;
  onTabChange: (id: string) => void;
  title?: string;
  avatar?: TabNavAvatar;
  className?: string;
}

/** PageTabNav for views without URL state, such as a profile sheet: the same shell, with buttons driven by `activeId`. */
export function LocalTabNav({ tabs, activeId, onTabChange, title, avatar, className }: LocalTabNavProps) {
  const indicator = useTabIndicator();
  // Scroll-reset target above the bar: inside a sheet the window-scoped useScrollReset() has no effect
  const sentinelRef = useRef<HTMLDivElement>(null);

  const scrollToReset = () => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const scrollParent = getScrollParent(sentinel);
    const containerTop = scrollParent === window ? 0 : (scrollParent as HTMLElement).getBoundingClientRect().top;
    if (sentinel.getBoundingClientRect().top < containerTop) {
      sentinel.scrollIntoView({ behavior: 'instant', block: 'start' });
    }
  };

  // The new tab's ActiveTabMarker scrolls it into view
  const select = (id: string) => {
    onTabChange(id);
    scrollToReset();
  };

  return (
    <>
      <div ref={sentinelRef} aria-hidden className="h-0" />
      <TabNavShell title={title} avatar={avatar} className={className} indicator={indicator}>
        {tabs.map(({ id, label }) => {
          const isActive = id === activeId;
          return (
            <button
              key={id}
              // data-tab, not id="tab-…": PageTabNav uses those ids and may render on the page behind this sheet
              data-tab={id}
              type="button"
              className={tabNavItemClass}
              data-active={isActive || undefined}
              aria-current={isActive || undefined}
              onClick={() => select(id)}
            >
              <TabNavLabel label={label} />
              {isActive && <ActiveTabMarker indicator={indicator} />}
            </button>
          );
        })}
      </TabNavShell>
    </>
  );
}
