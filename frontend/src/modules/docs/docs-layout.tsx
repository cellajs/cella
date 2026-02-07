import { useSuspenseQuery } from '@tanstack/react-query';
import { Outlet, useNavigate } from '@tanstack/react-router';
import { ArrowUpIcon, MenuIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useHotkeys } from '~/hooks/use-hot-keys';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { tagsQueryOptions } from '~/modules/docs/query';
import { DocsSidebar } from '~/modules/docs/sidebar/docs-sidebar';
import { FloatingNav, type FloatingNavItem } from '~/modules/navigation/floating-nav/floating-nav';
import { ResizableGroup, ResizablePanel, ResizableSeparator } from '~/modules/ui/resizable';
import { ScrollArea } from '~/modules/ui/scroll-area';
import { useUIStore } from '~/store/ui';

function DocsLayout() {
  const navigate = useNavigate();
  const isMobile = useBreakpoints('max', 'sm');
  const focusView = useUIStore((state) => state.focusView);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

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
        showCloseButton: false,
        closeSheetOnRouteChange: false,
      });
    }
  };

  const scrollToTop = () => {
    mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
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
      <>
        <div>
          <FloatingNav
            items={floatingNavItems}
            scrollContainerRef={mainRef}
            bodyClass="docs-floating-nav"
            resetTrigger={sidebarOpen}
            onScrollTopChange={(scrollTop) => setShowScrollTop(scrollTop > 300)}
          />
          <main ref={mainRef} className="h-screen pt-3 sm:pt-6 overflow-auto pb-[70vh]">
            <Outlet />
          </main>
        </div>
      </>
    );
  }

  // Desktop layout with resizable panels
  return (
    <>
      <div className="h-screen [--card:oklch(0.987_0.0013_285.76)] dark:[--card:oklch(0.232_0.0095_285.56)]">
        <ResizableGroup orientation="horizontal" className="h-screen">
          {!focusView && (
            <>
              <ResizablePanel defaultSize="20%" minSize="16rem" maxSize="40%">
                <div className="h-screen">
                  <ScrollArea className="h-full w-full">{sidebarContent}</ScrollArea>
                </div>
              </ResizablePanel>
              <ResizableSeparator />
            </>
          )}
          <ResizablePanel>
            <main className="h-screen pt-3 sm:pt-6 overflow-auto pb-[70vh]">
              <Outlet />
            </main>
          </ResizablePanel>
        </ResizableGroup>
      </div>
    </>
  );
}

export default DocsLayout;
