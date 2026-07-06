import { useSuspenseQuery } from '@tanstack/react-query';
import { Outlet, useNavigate } from '@tanstack/react-router';
import { ArrowUpIcon, MenuIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { useHotkeys } from '~/hooks/use-hot-keys';
import { useScrollVisibility } from '~/hooks/use-scroll-visibility';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { tagsQueryOptions } from '~/modules/docs/query';
import { DocsSidebar } from '~/modules/docs/sidebar/docs-sidebar';
import { FloatingNav, type FloatingNavItem } from '~/modules/navigation/floating-nav/floating-nav';
import { ScrollArea } from '~/modules/ui/scroll-area';
import { useUIStore } from '~/modules/ui/ui-store';

const MIN_SIDEBAR_WIDTH = 256;
const MAX_SIDEBAR_WIDTH = 600;
const DEFAULT_SIDEBAR_WIDTH = 288;

function DocsLayout() {
  const navigate = useNavigate();
  const isMobile = useBreakpointBelow('sm');
  const focusView = useUIStore((state) => state.focusView);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Resizable sidebar width (desktop only). The main content uses window scroll,
  // offset by this width, so window scroll restoration just works.
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);

  // Track scroll position for scroll-to-top button visibility (mobile floating nav)
  const { scrollTop } = useScrollVisibility(isMobile);
  const showScrollTop = scrollTop > 300;

  // Drag the sidebar edge to resize. Updates width during pointer move, ends on pointer up.
  const startSidebarResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    const onMove = (ev: PointerEvent) => {
      const next = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, startWidth + (ev.clientX - startX)));
      setSidebarWidth(next);
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.body.style.cursor = '';
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
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
    if (!isMobile && sidebarOpen) {
      useSheeter.getState().remove('docs-sidebar');
    }
  }, [isMobile, sidebarOpen]);

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
  if (isMobile) {
    return (
      <div>
        <FloatingNav items={floatingNavItems} bodyClass="docs-floating-nav" resetTrigger={sidebarOpen} />
        <main className="pb-[70vh]">
          <Outlet />
        </main>
      </div>
    );
  }

  // Desktop layout: fixed resizable sidebar + window-scrolled main content
  return (
    <>
      {!focusView && (
        <aside className="fixed inset-y-0 left-0 z-30 flex bg-background" style={{ width: sidebarWidth }}>
          <ScrollArea className="h-full w-full">{sidebarContent}</ScrollArea>
          <button
            type="button"
            aria-label="Resize sidebar"
            onPointerDown={startSidebarResize}
            className="absolute top-0 right-0 z-30 h-full w-px cursor-col-resize bg-border transition-colors after:absolute after:inset-y-0 after:-right-1.5 after:w-3 after:content-[''] hover:bg-primary/50 focus-visible:bg-primary"
          />
        </aside>
      )}
      <main className="pb-[70vh]" style={{ marginLeft: focusView ? 0 : sidebarWidth }}>
        <Outlet />
      </main>
    </>
  );
}

export default DocsLayout;
