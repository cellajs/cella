import { useSuspenseQuery } from '@tanstack/react-query';
import { Outlet, useNavigate } from '@tanstack/react-router';
import i18n from 'i18next';
import { ArrowUpIcon, MenuIcon } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useBreakpointAbove } from '~/hooks/use-breakpoints';
import { useHotkeys } from '~/hooks/use-hot-keys';
import { useScrolledPast } from '~/hooks/use-scrolled-past';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { tagsQueryOptions } from '~/modules/docs/query';
import { toggleDocsSearch } from '~/modules/docs/search/open-docs-search';
import { DocsSidebar } from '~/modules/docs/sidebar/docs-sidebar';
import { FloatingNav, type FloatingNavItem } from '~/modules/navigation/floating-nav/floating-nav';
import { ScrollArea } from '~/modules/ui/scroll-area';

const MIN_SIDEBAR_WIDTH = 220;
const MAX_SIDEBAR_WIDTH = 400;

function DocsLayout() {
  const navigate = useNavigate();
  const isDesktop = useBreakpointAbove('md');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Resizable sidebar width (desktop only); main content uses window scroll offset by the same CSS variable
  const [resizedSidebarWidth, setResizedSidebarWidth] = useState<number | null>(null);

  const showScrollTop = useScrolledPast(300, !isDesktop);

  const startSidebarResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarRef.current?.getBoundingClientRect().width ?? MIN_SIDEBAR_WIDTH;
    // The drag writes the variable to the DOM once per frame and commits state on release, so it doesn't re-render the layout and sidebar
    let width: number | null = null;
    let frame = 0;
    const writeWidth = () => {
      frame = 0;
      if (width !== null) wrapperRef.current?.style.setProperty('--docs-sidebar-width', `${width}px`);
    };
    const onMove = (ev: PointerEvent) => {
      width = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, startWidth + (ev.clientX - startX)));
      if (!frame) frame = requestAnimationFrame(writeWidth);
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
      document.body.style.cursor = '';
      cancelAnimationFrame(frame);
      writeWidth();
      if (width !== null) setResizedSidebarWidth(width);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
    document.body.style.cursor = 'col-resize';
  };

  const { data: tags } = useSuspenseQuery(tagsQueryOptions);

  const sidebarOpen = useSheeter((state) => state.sheets.some((s) => s.id === 'docs-sidebar'));

  const sidebarContent = <DocsSidebar tags={tags} />;

  useEffect(() => {
    if (isDesktop && sidebarOpen) {
      useSheeter.getState().remove('docs-sidebar');
    }
  }, [isDesktop, sidebarOpen]);

  // Search on ⌘K/Ctrl-K ('mod' matching is broken in the helper, so bind both), collapse on ESC
  useHotkeys([
    ['meta + k', () => toggleDocsSearch()],
    ['ctrl + k', () => toggleDocsSearch()],
    [
      'Escape',
      () => {
        if (sidebarOpen) {
          useSheeter.getState().remove('docs-sidebar');
          return;
        }
        navigate({ to: '.', search: (prev) => ({ ...prev, operationTag: undefined }), resetScroll: false, replace: true });
      },
    ],
  ]);

  const toggleSidebar = () => {
    if (sidebarOpen) {
      useSheeter.getState().remove('docs-sidebar');
    } else {
      useSheeter.getState().create(sidebarContent, {
        id: 'docs-sidebar',
        side: 'left',
        triggerRef,
        title: i18n.t('c:docs'),
        headerClassName: 'hidden',
        className: 'w-72 p-0',
        closeSheetOnRouteChange: false,
      });
    }
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const floatingNavItems: FloatingNavItem[] = [
    { id: 'docs-menu', icon: MenuIcon, onClick: toggleSidebar, ariaLabel: 'Toggle menu', direction: 'left' },
    {
      id: 'docs-scroll-top',
      icon: ArrowUpIcon,
      onClick: scrollToTop,
      ariaLabel: 'Scroll to top',
      visible: showScrollTop,
      direction: 'right',
    },
  ];

  if (!isDesktop) {
    return (
      <div>
        <FloatingNav items={floatingNavItems} bodyClass="docs-floating-nav" resetTrigger={sidebarOpen} />
        <main className="focus-view-scope pt-4 pb-[70vh]">
          <Outlet />
        </main>
      </div>
    );
  }

  const sidebarWidthStyle = resizedSidebarWidth === null ? undefined : ({ '--docs-sidebar-width': `${resizedSidebarWidth}px` } as CSSProperties);

  return (
    <div ref={wrapperRef} className="contents [--docs-sidebar-width:clamp(220px,24vw,288px)]" style={sidebarWidthStyle}>
      <aside ref={sidebarRef} className="fixed inset-y-0 left-0 z-30 flex w-(--docs-sidebar-width) bg-background focus-view:hidden">
        <ScrollArea className="size-full">{sidebarContent}</ScrollArea>
        <button
          type="button"
          aria-label="Resize sidebar"
          onPointerDown={startSidebarResize}
          className="absolute top-0 right-0 z-30 h-full w-px cursor-col-resize bg-border transition-colors after:absolute after:inset-y-0 after:-right-1.5 after:w-3 after:content-[''] hover:bg-primary/50 focus-visible:bg-primary"
        />
      </aside>
      <main className="focus-view-scope ml-(--docs-sidebar-width) pb-[70vh] focus-view:ml-0">
        <Outlet />
      </main>
    </div>
  );
}

export { DocsLayout };
