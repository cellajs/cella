import { useSuspenseQuery } from '@tanstack/react-query';
import { Outlet, useNavigate } from '@tanstack/react-router';
import { ArrowUpIcon, MenuIcon } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useBreakpointAbove } from '~/hooks/use-breakpoints';
import { useHotkeys } from '~/hooks/use-hot-keys';
import { useScrollVisibility } from '~/hooks/use-scroll-visibility';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { tagsQueryOptions } from '~/modules/docs/query';
import { DocsSidebar } from '~/modules/docs/sidebar/docs-sidebar';
import { FloatingNav, type FloatingNavItem } from '~/modules/navigation/floating-nav/floating-nav';
import { ScrollArea } from '~/modules/ui/scroll-area';
import { useUIStore } from '~/modules/ui/ui-store';
import { cn } from '~/utils/cn';

const MIN_SIDEBAR_WIDTH = 220;
const MAX_SIDEBAR_WIDTH = 400;

function DocsLayout() {
  const navigate = useNavigate();
  const isDesktop = useBreakpointAbove('md');
  const focusView = useUIStore((state) => state.focusView);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);

  // Resizable sidebar width (desktop only). The main content uses window scroll,
  // offset by the same CSS variable, so window scroll restoration just works.
  const [resizedSidebarWidth, setResizedSidebarWidth] = useState<number | null>(null);

  // Track scroll position for scroll-to-top button visibility (mobile floating nav)
  const { scrollTop } = useScrollVisibility(!isDesktop);
  const showScrollTop = scrollTop > 300;

  // Drag the sidebar edge to resize. Updates width during pointer move, ends on pointer up.
  const startSidebarResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarRef.current?.getBoundingClientRect().width ?? MIN_SIDEBAR_WIDTH;
    const onMove = (ev: PointerEvent) => {
      const next = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, startWidth + (ev.clientX - startX)));
      setResizedSidebarWidth(next);
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
      document.body.style.cursor = '';
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
    document.body.style.cursor = 'col-resize';
  };

  // Fetch tags via React Query (reduces bundle size)
  const { data: tags } = useSuspenseQuery(tagsQueryOptions);

  // Get sheeter state
  const sheets = useSheeter((state) => state.sheets);
  const sidebarOpen = sheets.some((s) => s.id === 'docs-sidebar');

  const sidebarContent = <DocsSidebar tags={tags} />;

  // Create or remove sheet based on mobile state
  useEffect(() => {
    // Clean up sheet when switching to desktop
    if (isDesktop && sidebarOpen) {
      useSheeter.getState().remove('docs-sidebar');
    }
  }, [isDesktop, sidebarOpen]);

  // Collapse all expanded items on ESC
  useHotkeys([
    [
      'Escape',
      () => {
        if (sidebarOpen) {
          useSheeter.getState().remove('docs-sidebar');
          return;
        }
        navigate({
          to: '.',
          search: (prev) => ({ ...prev, operationTag: undefined }),
          resetScroll: false,
          replace: true,
        });
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
        className: 'w-72 p-0',
        closeSheetOnRouteChange: false,
      });
    }
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Floating nav items for mobile
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

  // Mobile layout with floating nav
  if (!isDesktop) {
    return (
      <div>
        <FloatingNav items={floatingNavItems} bodyClass="docs-floating-nav" resetTrigger={sidebarOpen} />
        <main className="pt-4 pb-[70vh]">
          <Outlet />
        </main>
      </div>
    );
  }

  const sidebarWidthStyle =
    resizedSidebarWidth === null
      ? undefined
      : ({
          '--docs-sidebar-width': `${resizedSidebarWidth}px`,
        } as CSSProperties);

  // Desktop layout: fixed resizable sidebar + window-scrolled main content
  return (
    <div className="contents [--docs-sidebar-width:clamp(220px,24vw,288px)]" style={sidebarWidthStyle}>
      {!focusView && (
        <aside ref={sidebarRef} className="fixed inset-y-0 left-0 z-30 flex w-(--docs-sidebar-width) bg-background">
          <ScrollArea className="h-full w-full">{sidebarContent}</ScrollArea>
          <button
            type="button"
            aria-label="Resize sidebar"
            onPointerDown={startSidebarResize}
            className="absolute top-0 right-0 z-30 h-full w-px cursor-col-resize bg-border transition-colors after:absolute after:inset-y-0 after:-right-1.5 after:w-3 after:content-[''] hover:bg-primary/50 focus-visible:bg-primary"
          />
        </aside>
      )}
      <main className={cn('pt-12 pb-[70vh]', !focusView && 'ml-(--docs-sidebar-width)')}>
        <Outlet />
      </main>
    </div>
  );
}

export { DocsLayout };
