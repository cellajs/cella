import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { TKey } from '~/lib/i18n-locales';
import { ActiveTabMarker, useTabIndicator } from '~/modules/common/page/tab-indicator';
import { type TabNavAvatar, TabNavShell } from '~/modules/common/page/tab-nav-shell';
import { getScrollParent } from '~/modules/common/sticky-box';
import { truncateMiddle } from '~/utils/truncate-middle';

export type LocalTab = { id: string; label: TKey };

interface Props {
  tabs: LocalTab[];
  activeId: string;
  onTabChange: (id: string) => void;
  title?: string;
  avatar?: TabNavAvatar;
  className?: string;
}

/**
 * Routeless twin of PageTabNav for surfaces without URL state, such as a profile sheet: the same
 * visual shell, with tabs as plain buttons driven by `activeId` and `onTabChange`.
 */
export function LocalTabNav({ tabs, activeId, onTabChange, title, avatar, className }: Props) {
  const { t } = useTranslation();
  const indicator = useTabIndicator();
  // Zero-height sentinel above the bar: the scroll-reset target inside a sheet, where the
  // window-scoped useScrollReset() has no effect.
  const resetRef = useRef<HTMLDivElement>(null);

  const scrollToReset = () => {
    const sentinel = resetRef.current;
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
      <div ref={resetRef} aria-hidden className="h-0" />
      <TabNavShell title={title} avatar={avatar} className={className} indicator={indicator}>
        {tabs.map(({ id, label }) => {
          const isActive = id === activeId;
          return (
            <button
              key={id}
              // data-tab, not id="tab-…": PageTabNav uses those ids and may render on the page behind this sheet
              data-tab={id}
              type="button"
              className="focus-effect group relative rounded-sm px-2 py-3 font-medium opacity-70 ring-inset ring-offset-0 transition-opacity last:mr-4 hover:opacity-100 data-[active=true]:opacity-100 lg:px-4"
              data-active={isActive || undefined}
              onClick={() => select(id)}
            >
              <span className="block group-active:translate-y-[.05rem]">{truncateMiddle(t(label), 20)}</span>
              {isActive && <ActiveTabMarker indicator={indicator} />}
            </button>
          );
        })}
      </TabNavShell>
    </>
  );
}
