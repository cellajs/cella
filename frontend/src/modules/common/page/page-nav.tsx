import { Link, type ToPathOption } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { type MouseEventHandler, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useInView } from 'react-intersection-observer';
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
  const layoutId = useMemo(() => nanoid(), []);

  const { t } = useTranslation();
  const { ref: inViewRef, inView } = useInView({ triggerOnce: false, threshold: 0 });

  // Focus the first tab on mount
  useEffect(() => {
    document.getElementById(`tab-${tabs[0].id}`)?.focus();
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
      <StickyBox className={cn('flex gap-1 justify-center border-b bg-background/75 backdrop-blur-xs z-80', className)}>
        <div className="hidden md:group-[.is-sticky]/sticky:flex absolute left-0 h-full items-center">
          {avatar && <AvatarWrap className="m-3 h-5 w-5 text-xs" type="organization" id={avatar.id} name={avatar.name} url={avatar.thumbnailUrl} />}
          <div className="truncate leading-5 font-semibold text-sm max-w-42 sm:block">{title}</div>
        </div>

        {tabs.map(({ id, path, label }) => (
          <Link
            key={id}
            id={`tab-${id}`}
            resetScroll={false}
            className="relative p-2 lg:px-4 rounded-sm outline-hidden sm:ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            to={path}
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
      </StickyBox>
    </>
  );
};
