import { Link, type LinkComponentProps } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useInView } from 'react-intersection-observer';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import useMounted from '~/hooks/use-mounted';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import StickyBox from '~/modules/common/sticky-box';
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
  tabs: PageTab[];
  title?: string;
  avatar?: {
    id: string;
    thumbnailUrl?: string | null;
    name: string;
  };
  fallbackToFirst?: boolean;
  className?: string;
}

export const PageNav = ({ tabs, title, avatar, fallbackToFirst, className }: Props) => {
  const { t } = useTranslation();
  const isMobile = useBreakpoints('max', 'sm', false);
  const { hasStarted } = useMounted();

  const layoutId = useRef(nanoid()).current;

  const tabRefs = useRef<Record<string, HTMLAnchorElement | null>>({});

  const { ref: inViewRef, inView } = useInView({ triggerOnce: false, threshold: 0 });

  // Focus the first tab on mount
  useEffect(() => {
    if (!isMobile && hasStarted) tabRefs.current[tabs[0].id]?.focus();
  }, [hasStarted]);

  const scrollTabIntoView = (id: string) => {
    const tab = tabRefs.current[id];
    tab?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  };

  const handleTabClick = (id: string, el: HTMLAnchorElement | null) => {
    const isActive = el?.dataset.active === 'true';
    scrollTabIntoView(id);
    updateScrollPosition(el, isActive);
  };

  // Scroll to tabs when scrolled past header
  const updateScrollPosition = (tabEl: HTMLAnchorElement | null, isActive: boolean) => {
    if (isActive || !tabEl) return;

    const tabsWrapper = document.getElementById('tabs-position');
    if (inView || !tabsWrapper) return;

    window.scrollTo({ top: tabsWrapper.offsetTop });
  };

  return (
    <>
      <div id="tabs-position" ref={inViewRef} />
      <StickyBox
        className={cn(
          'max-sm:overflow-x-auto block text-center [scrollbar-width:none] [&::-webkit-scrollbar]:hidden gap-1 border-b bg-background/75 backdrop-blur-xs z-80',
          className,
        )}
      >
        <div className="hidden md:group-[.is-sticky]/sticky:flex absolute left-0 h-full items-center">
          {avatar && <AvatarWrap className="m-3 h-5 w-5 text-xs" type="organization" id={avatar.id} name={avatar.name} url={avatar.thumbnailUrl} />}
          {title && <div className="truncate leading-5 font-semibold text-sm max-w-42 sm:block">{title}</div>}
        </div>
        <div className="inline-flex min-w-max gap-1 px-1 sm:justify-center sm:flex">
          {tabs.map(({ id, path, label, search = {}, params = true, activeOptions = { exact: true, includeSearch: false } }, index) => (
            <Link
              key={id}
              id={`tab-${id}`}
              ref={(el) => {
                if (el) tabRefs.current[id] = el;
              }}
              resetScroll={false}
              className="relative last:mr-4 max-sm:p-3 p-2 lg:px-4 rounded-sm outline-hidden sm:ring-offset-background sm:focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              to={path}
              draggable="false"
              data-active={fallbackToFirst && index === 0 ? true : undefined}
              params={params}
              search={search}
              activeOptions={activeOptions}
              activeProps={{ 'data-active': true }}
              onClick={(e) => handleTabClick(id, e.currentTarget)}
            >
              {({ isActive }) => {
                const showAsActive = isActive || (fallbackToFirst && index === 0);
                return (
                  <>
                    {t(label)}
                    {showAsActive && (
                      <motion.span
                        initial={false}
                        layoutId={layoutId}
                        transition={{ type: 'spring', duration: 0.4, bounce: 0, delay: 0.1 }}
                        className="h-1 bg-primary rounded-sm w-[calc(100%-1rem)] absolute bottom-0 left-2"
                      />
                    )}
                  </>
                );
              }}
            </Link>
          ))}
        </div>
      </StickyBox>
    </>
  );
};
