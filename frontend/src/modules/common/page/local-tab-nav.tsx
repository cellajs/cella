import { motion } from 'motion/react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { EntityType } from 'shared';
import { nanoid } from 'shared/utils/nanoid';
import { useMountedState } from '~/hooks/use-mounted-state';
import type { TKey } from '~/lib/i18n-locales';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { getScrollParent, StickyBox } from '~/modules/common/sticky-box';
import { cn } from '~/utils/cn';
import { truncateMiddle } from '~/utils/truncate-middle';

export type LocalTab = { id: string; label: TKey };

interface Props {
  tabs: LocalTab[];
  activeId: string;
  onTabChange: (id: string) => void;
  title?: string;
  avatar?: {
    id: string;
    thumbnailUrl?: string | null;
    name: string;
    type?: EntityType;
  };
  className?: string;
}

/**
 * Routeless twin of PageTabNav for surfaces without URL state, such as a profile sheet: the same
 * visual shell, with tabs as plain buttons driven by `activeId` and `onTabChange`.
 */
export function LocalTabNav({ tabs, activeId, onTabChange, title, avatar, className }: Props) {
  const { t } = useTranslation();
  const { hasStarted } = useMountedState();

  const layoutId = useRef(nanoid()).current;
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
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

  const select = (id: string) => {
    onTabChange(id);
    scrollToReset();
    tabRefs.current[id]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  };

  return (
    <>
      <div ref={resetRef} aria-hidden className="h-0" />
      <StickyBox
        publishVar="--sticky-stack-nav"
        className={cn(
          'group/sticky z-80 block gap-1 border-b bg-background/75 text-center backdrop-blur-xs',
          className,
        )}
      >
        <div className="absolute left-0 hidden h-full items-center sm:group-data-[sticky=true]/sticky:flex">
          {avatar && (
            <EntityAvatar
              className="m-3 h-5 w-5 text-xs"
              type={avatar.type ?? 'organization'}
              id={avatar.id}
              name={avatar.name}
              url={avatar.thumbnailUrl}
            />
          )}
          {title && <div className="max-w-42 truncate font-semibold text-sm leading-5 sm:block">{title}</div>}
        </div>
        <div className="scrollbar-none max-w-screen overflow-x-auto [&::-webkit-scrollbar]:hidden">
          <div className="inline-flex min-w-max gap-1 px-1 sm:flex sm:justify-center">
            {tabs.map(({ id, label }) => {
              const isActive = id === activeId;
              return (
                <button
                  key={id}
                  // data-tab, not id="tab-…": PageTabNav uses those ids and may render on the page behind this sheet
                  data-tab={id}
                  type="button"
                  ref={(el) => {
                    if (el) tabRefs.current[id] = el;
                  }}
                  className="focus-effect group relative rounded-sm px-2 py-3 font-medium opacity-70 ring-inset ring-offset-0 transition-opacity last:mr-4 hover:opacity-100 data-[active=true]:opacity-100 lg:px-4"
                  data-active={isActive || undefined}
                  onClick={() => select(id)}
                >
                  <span className="block group-active:translate-y-[.05rem]">{truncateMiddle(t(label), 20)}</span>
                  {isActive && hasStarted && (
                    <motion.span
                      layoutId={layoutId}
                      transition={{ type: 'spring', duration: 0.4, bounce: 0, delay: 0.1 }}
                      className="absolute bottom-0 left-2 h-1 w-[calc(100%-1rem)] rounded-sm bg-primary"
                    />
                  )}
                  {isActive && !hasStarted && (
                    <span className="absolute bottom-0 left-2 h-1 w-[calc(100%-1rem)] rounded-sm bg-primary" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </StickyBox>
    </>
  );
}
