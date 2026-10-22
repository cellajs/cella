import { Outlet, useNavigate } from '@tanstack/react-router';
import i18n from 'i18next';
import { ArrowUpIcon, MenuIcon } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useBreakpointAbove } from '~/hooks/use-breakpoints';
import { useFirstTimeHint } from '~/hooks/use-first-time-hint';
import { useHotkeys } from '~/hooks/use-hot-keys';
import { useScrolledPast } from '~/hooks/use-scrolled-past';
import { type SheetData, sheeter, useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { toggleDocsSearch } from '~/modules/docs/search/open-docs-search';
import { DocsSidebar } from '~/modules/docs/sidebar/docs-sidebar';
import { docsSidebarSheetId, isDocsSidebarOpen } from '~/modules/docs/sidebar/docs-sidebar-sheet';
import { FloatingNav, type FloatingNavItem } from '~/modules/navigation/floating-nav/floating-nav';
import { ScrollArea } from '~/modules/ui/scroll-area';
import { cancelIdle, scheduleIdle } from '~/utils/schedule-idle';
import { tw } from '~/utils/tw';

const minSidebarWidth = 220;
const maxSidebarWidth = 400;

/** The width of `--docs-sidebar-width`'s CSS default, clamp(220px, 24vw, 288px), for the resize handle's value. */
const getDefaultSidebarWidth = () => Math.round(Math.min(288, Math.max(minSidebarWidth, window.innerWidth * 0.24)));

function DocsLayout() {
  const navigate = useNavigate();
  const isDesktop = useBreakpointAbove('md');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Resizable sidebar width (desktop only); main content uses window scroll offset by the same CSS variable
  const [resizedSidebarWidth, setResizedSidebarWidth] = useState<number | null>(null);

  const showScrollTop = useScrolledPast(300, !isDesktop);
  // First-visit affordance: the menu button reads "menu" while at the top of the page
  const isAtTop = !useScrolledPast(8, !isDesktop);
  const showMenuLabel = useFirstTimeHint('floating-menu-docs', !isDesktop && isAtTop);

  const startSidebarResize = (event: React.PointerEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidebarRef.current?.getBoundingClientRect().width ?? minSidebarWidth;
    // The drag writes the variable to the DOM once per frame and commits state on release, so it doesn't re-render the layout and sidebar
    let width: number | null = null;
    let frame = 0;
    const writeWidth = () => {
      frame = 0;
      if (width !== null) wrapperRef.current?.style.setProperty('--docs-sidebar-width', `${width}px`);
    };
    const handlePointerMove = (moveEvent: PointerEvent) => {
      width = Math.min(maxSidebarWidth, Math.max(minSidebarWidth, startWidth + (moveEvent.clientX - startX)));
      if (!frame) frame = requestAnimationFrame(writeWidth);
    };
    const handlePointerUp = () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('pointercancel', handlePointerUp);
      document.body.style.cursor = '';
      cancelAnimationFrame(frame);
      writeWidth();
      if (width !== null) setResizedSidebarWidth(width);
    };
    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointercancel', handlePointerUp);
    document.body.style.cursor = 'col-resize';
  };

  // The keyboard path of the same handle: arrows move it in steps, Home and End jump to the limits.
  const resizeSidebarByKey = (event: React.KeyboardEvent) => {
    const width = sidebarRef.current?.getBoundingClientRect().width ?? minSidebarWidth;
    const target = { ArrowLeft: width - 16, ArrowRight: width + 16, Home: minSidebarWidth, End: maxSidebarWidth }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    setResizedSidebarWidth(Math.min(maxSidebarWidth, Math.max(minSidebarWidth, target)));
  };

  const isSidebarOpen = useSheeter((state) => isDocsSidebarOpen(state.sheets));

  const sidebarContent = <DocsSidebar />;
  const sidebarSheet: SheetData = {
    id: docsSidebarSheetId,
    side: 'left',
    triggerRef,
    title: i18n.t('c:docs'),
    headerClassName: 'hidden',
    className: tw('w-72 p-0'),
    closeSheetOnRouteChange: false,
    keepMounted: true,
  };

  // Below `md` the sheet mounts closed at idle, so a menu tap only slides it in. Leaving the docs or reaching `md` unmounts it.
  useEffect(() => {
    if (isDesktop) return;
    const handle = scheduleIdle(() => sheeter.getState().mount(sidebarContent, sidebarSheet), 1000);
    return () => {
      cancelIdle(handle);
      sheeter.getState().unmount(docsSidebarSheetId);
    };
  }, [isDesktop]);

  // Search on ⌘K/Ctrl-K, collapse on ESC
  useHotkeys([
    ['Mod + K', () => toggleDocsSearch()],
    [
      'Escape',
      () => {
        // The open sidebar sheet closes on its own Escape
        if (isSidebarOpen) return;
        navigate({ to: '.', search: (prev) => ({ ...prev, operationTag: undefined }), resetScroll: false, replace: true });
      },
    ],
  ]);

  const toggleSidebar = () => {
    if (isSidebarOpen) {
      sheeter.getState().remove(docsSidebarSheetId);
    } else {
      sheeter.getState().create(sidebarContent, sidebarSheet);
    }
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const floatingNavItems: FloatingNavItem[] = [
    {
      id: 'docs-menu',
      icon: MenuIcon,
      onClick: toggleSidebar,
      ariaLabel: i18n.t('c:toggle_menu'),
      direction: 'left',
      label: i18n.t('c:menu'),
      labelVisible: showMenuLabel,
    },
    {
      id: 'docs-scroll-top',
      icon: ArrowUpIcon,
      onClick: scrollToTop,
      ariaLabel: i18n.t('c:scroll_to_top'),
      visible: showScrollTop,
      direction: 'right',
    },
  ];

  if (!isDesktop) {
    return (
      <div>
        <FloatingNav items={floatingNavItems} bodyClass="docs-floating-nav" resetTrigger={isSidebarOpen} />
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
        {/* biome-ignore lint/a11y/useSemanticElements: a focusable resize handle, which `<hr>`, a static rule, is not */}
        <div
          role="separator"
          aria-label={i18n.t('c:resize_sidebar')}
          aria-orientation="vertical"
          aria-valuenow={resizedSidebarWidth ?? getDefaultSidebarWidth()}
          aria-valuemin={minSidebarWidth}
          aria-valuemax={maxSidebarWidth}
          tabIndex={0}
          onPointerDown={startSidebarResize}
          onDoubleClick={() => setResizedSidebarWidth(null)}
          onKeyDown={resizeSidebarByKey}
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
