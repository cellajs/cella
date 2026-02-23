import { Link, type LinkComponentProps } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useInView } from 'react-intersection-observer';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useMountedState } from '~/hooks/use-mounted-state';
import { useNavTabs } from '~/hooks/use-nav-tabs';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { StickyBox } from '~/modules/common/sticky-box';
import { cn } from '~/utils/cn';
import { nanoid } from '~/utils/nanoid';

export type PageTab = {
  id: string;
  label: string;
  path: LinkComponentProps['to'];
  params?: LinkComponentProps['params'];
  search?: LinkComponentProps['search'];
  activeOptions?: LinkComponentProps['activeOptions'];
};

interface Props {
  /** Explicit tabs array - if provided, takes precedence over parentRouteId */
  tabs?: PageTab[];
  /** Parent route ID to auto-generate tabs from child routes with staticData.navTab */
  parentRouteId?: string;
  /** Filter which tab IDs to show (for permission-based filtering) */
  filterTabIds?: string[];
  title?: string;
  avatar?: {
    id: string;
    thumbnailUrl?: string | null;
    name: string;
  };
  fallbackToFirst?: boolean;
  className?: string;
}

export const PageTabNav = ({
  tabs: explicitTabs,
  parentRouteId,
  filterTabIds,
  title,
  avatar,
  fallbackToFirst,
  className,
}: Props) => {
  const { t } = useTranslation();
  const isMobile = useBreakpoints('max', 'sm', false);
  const { hasStarted } = useMountedState();

  // Use explicit tabs or auto-generate from parent route's children
  const autoTabs = useNavTabs(parentRouteId ?? '', filterTabIds);
  const tabs = explicitTabs ?? autoTabs;

  const layoutId = useRef(nanoid()).current;

  const tabRefs = useRef<Record<string, HTMLAnchorElement | null>>({});

  const { ref: inViewRef, inView } = useInView({ triggerOnce: false, threshold: 0 });

  // Focus the first tab on mount
  useEffect(() => {
    if (!isMobile && hasStarted && tabs[0]) tabRefs.current[tabs[0].id]?.focus();
  }, [hasStarted]);

  const scrollTabIntoView = (id: string) => {
    const tab = tabRefs.current[id];
    tab?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  };

  // Scroll to tabs when scrolled past header
  const updateScrollPosition = (tabEl: HTMLAnchorElement | null) => {
    if (!tabEl) return;

    const tabsWrapper = document.getElementById('tabs-position');
    if (inView || !tabsWrapper) return;

    window.scrollTo({ top: tabsWrapper.offsetTop });
  };

  return (
    <>
      <div id="tabs-position" ref={inViewRef} />
      <StickyBox
        className={cn(
          'group/sticky block text-center gap-1 border-b bg-background/75 backdrop-blur-xs z-80',
          className,
        )}
      >
        <div className="hidden sm:group-data-[sticky=true]/sticky:flex absolute left-0 h-full items-center">
          {avatar && (
            <AvatarWrap
              className="m-3 h-5 w-5 text-xs"
              type="organization"
              id={avatar.id}
              name={avatar.name}
              url={avatar.thumbnailUrl}
            />
          )}
          {title && <div className="truncate leading-5 font-semibold text-sm max-w-42 sm:block">{title}</div>}
        </div>
        <div className="overflow-x-auto max-w-screen [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="inline-flex min-w-max gap-1 px-1 sm:justify-center sm:flex">
            {tabs.map(
              (
                { id, path, label, search = {}, params = true, activeOptions = { exact: true, includeSearch: false } },
                index,
              ) => (
                <Link
                  key={id}
                  id={`tab-${id}`}
                  ref={(el) => {
                    if (el) tabRefs.current[id] = el;
                  }}
                  resetScroll={false}
                  className="relative last:mr-4 p-2 lg:px-4 rounded-sm font-medium focus-effect ring-inset ring-offset-0 group opacity-70 hover:opacity-100 data-[active=true]:opacity-100 transition-opacity"
                  to={path}
                  draggable="false"
                  data-active={fallbackToFirst && index === 0 ? true : undefined}
                  params={params}
                  search={search}
                  activeOptions={activeOptions}
                  activeProps={{ 'data-active': true }}
                  onClick={(e) => updateScrollPosition(e.currentTarget)}
                >
                  {({ isActive }) => {
                    const showAsActive = isActive || (fallbackToFirst && index === 0);
                    if (showAsActive) scrollTabIntoView(id);

                    return (
                      <>
                        <span className="block group-active:translate-y-[.05rem]">{t(label)}</span>
                        {showAsActive && hasStarted && (
                          <motion.span
                            layoutId={layoutId}
                            transition={{ type: 'spring', duration: 0.4, bounce: 0, delay: 0.1 }}
                            className="h-1 bg-primary rounded-sm w-[calc(100%-1rem)] absolute bottom-0 left-2"
                          />
                        )}
                        {showAsActive && !hasStarted && (
                          <span className="h-1 bg-primary rounded-sm w-[calc(100%-1rem)] absolute bottom-0 left-2" />
                        )}
                      </>
                    );
                  }}
                </Link>
              ),
            )}
          </div>
        </div>
      </StickyBox>
    </>
  );
};
