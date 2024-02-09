import { Link } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { useInView } from 'react-intersection-observer';

interface Props {
  title?: string;
  avatar?: {
    id: string;
    thumbnailUrl?: string | null;
    name: string;
  };
  tabs: {
    name: string;
    path: string;
  }[];
}

const PageNav = ({ title, avatar, tabs }: Props) => {
  const { ref: inViewRef, inView } = useInView({ triggerOnce: false, threshold: 0 });

  const tabsRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    //remove hidden when tabs on top of page
    window.addEventListener('scroll', () => {
      if (!tabsRef.current || !nameRef.current) return;

      if (tabsRef.current.getBoundingClientRect().top === 0) {
        nameRef.current.classList.remove('hidden');
      } else {
        nameRef.current.classList.add('hidden');
      }
    });

    return () => {
      window.removeEventListener('scroll', () => {});
    };
  }, []);

  // Scroll to tabs when scrolled past header
  const updateScrollPosition = () => {
    const tabsWrapper = document.getElementById('tabs-position');
    if (inView || !tabsWrapper) return;

    window.scrollTo({
      top: tabsWrapper.offsetTop,
    });
  };

  return (
    <>
      <div id="tabs-position" ref={inViewRef} />
      <div className="flex justify-center border-b sticky top-0 bg-background/75 backdrop-blur-sm z-20" ref={tabsRef}>
        <div className="hidden" ref={nameRef}>
          <div className="absolute left-0 h-full flex items-center">
            {avatar && <AvatarWrap className="m-2 h-8 w-8" type="organization" id={avatar.id} name={avatar.name} url={avatar.thumbnailUrl} />}
            <div className="truncate hidden leading-5 font-semibold text-sm max-w-42 sm:block">{title}</div>
          </div>
        </div>

        {tabs.map(({ name, path }) => (
          <Link
            key={path}
            resetScroll={false}
            className="p-2 border-b-4 border-transparent"
            to={path}
            activeOptions={{ exact: true, includeSearch: false }}
            onClick={updateScrollPosition}
            activeProps={{ className: '!border-primary' }}
          >
            {name}
          </Link>
        ))}
      </div>
    </>
  );
};

export default PageNav;
