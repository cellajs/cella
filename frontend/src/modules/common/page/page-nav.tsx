import { Link, type ToPathOption } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { type MouseEventHandler, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useInView } from 'react-intersection-observer';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import StickyBox from '~/modules/common/sticky-box';
import { cn } from '~/utils/cn';
import { nanoid } from '~/utils/nanoid';

export type PageTab = {
  id: string;
  label: string;
  path: ToPathOption;
};

interface Props {
  title?: string;
  avatar?: {
    id: string;
    thumbnailUrl?: string | null;
    name: string;
  };
  tabs: PageTab[];
  className?: string;
}

export const PageNav = ({ title, avatar, tabs, className = '' }: Props) => {
  const isMobile = useBreakpoints('max', 'sm', false);
  const layoutId = useMemo(() => nanoid(), []);
  const firstTabRef = useRef<HTMLAnchorElement>(null);

  const { t } = useTranslation();
  const { ref: inViewRef, inView } = useInView({ triggerOnce: false, threshold: 0 });

  // Focus the first tab on mount
  useEffect(() => {
    if (!isMobile) firstTabRef.current?.focus();
  }, []);

  // Scroll to tabs when scrolled past header
  const updateScrollPosition: MouseEventHandler<HTMLAnchorElement> = (e) => {
    if (e.currentTarget.dataset.active) {
      e.preventDefault();
      return;
    }
    const tabsWrapper = document.getElementById('tabs-position');
    if (inView || !tabsWrapper) return;

    window.scrollTo({ top: tabsWrapper.offsetTop });
  };

  return (
    <>
      <div id="tabs-position" ref={inViewRef} />
      <StickyBox
        className={cn(
          'max-sm:overflow-x-auto block [scrollbar-width:none] [&::-webkit-scrollbar]:hidden gap-1 border-b bg-background/75 backdrop-blur-xs z-80',
          className,
        )}
      >
        <div className="hidden md:group-[.is-sticky]/sticky:flex absolute left-0 h-full items-center">
          {avatar && <AvatarWrap className="m-3 h-5 w-5 text-xs" type="organization" id={avatar.id} name={avatar.name} url={avatar.thumbnailUrl} />}
          <div className="truncate leading-5 font-semibold text-sm max-w-42 sm:block">{title}</div>
        </div>
        <div className="inline-flex min-w-max gap-1 px-1 sm:justify-center sm:flex">
          {tabs.map(({ id, path, label }, index) => (
            <Link
              key={id}
              id={`tab-${id}`}
              ref={index === 0 ? firstTabRef : undefined}
              resetScroll={false}
              className="relative last:mr-4 p-2 lg:px-4 rounded-sm outline-hidden sm:ring-offset-background sm:focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              to={path}
              draggable="false"
              params={true}
              activeOptions={{ exact: true, includeSearch: false }}
              activeProps={{ 'data-active': true }}
              onClick={updateScrollPosition}
            >
              {({ isActive }) => (
                <>
                  {t(label)}
                  {isActive && (
                    <motion.span
                      initial={false}
                      layoutId={layoutId}
                      transition={{ type: 'spring', duration: 0.4, bounce: 0, delay: 0.1 }}
                      className="h-1 bg-primary rounded-sm w-[calc(100%-1rem)] absolute bottom-0 left-2"
                    />
                  )}
                </>
              )}
            </Link>
          ))}
        </div>
      </StickyBox>
    </>
  );
};
