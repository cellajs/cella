import { useSuspenseQuery } from '@tanstack/react-query';
import { Link, Outlet, useLoaderData, useNavigate, useRouterState } from '@tanstack/react-router';
import { MenuIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useHotkeys } from '~/hooks/use-hot-keys';
import { useScrollVisibility } from '~/hooks/use-scroll-visibility';
import Logo from '~/modules/common/logo';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { DocsSidebar } from '~/modules/docs/docs-sidebar';
import { tagsQueryOptions } from '~/modules/docs/query';
import { Button } from '~/modules/ui/button';
import { ResizableGroup, ResizablePanel, ResizableSeparator } from '~/modules/ui/resizable';
import { ScrollArea } from '~/modules/ui/scroll-area';
import { DocsLayoutRoute } from '~/routes/docs-routes';

const DOCS_SIDEBAR_SHEET_ID = 'docs-sidebar';

const DocsLayout = () => {
  const navigate = useNavigate();
  const isMobile = useBreakpoints('max', 'sm');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { isVisible: showHeader, reset: resetHeaderVisibility } = useScrollVisibility(isMobile);

  // Reset header visibility on route or hash change (mobile)
  const { location } = useRouterState();
  useEffect(() => {
    if (isMobile) resetHeaderVisibility();
  }, [location.pathname, location.hash, isMobile, resetHeaderVisibility]);

  const { pagesCollection } = useLoaderData({ from: DocsLayoutRoute.id });

  // Fetch tags via React Query (reduces bundle size)
  const { data: tags } = useSuspenseQuery(tagsQueryOptions);

  // Get sheeter state
  const sheets = useSheeter((state) => state.sheets);
  const sidebarOpen = sheets.some((s) => s.id === DOCS_SIDEBAR_SHEET_ID);

  const sidebarContent = <DocsSidebar tags={tags} pagesCollection={pagesCollection} />;

  // Create or remove sheet based on mobile state
  useEffect(() => {
    // Clean up sheet when switching to desktop
    if (!isMobile && sidebarOpen) {
      useSheeter.getState().remove(DOCS_SIDEBAR_SHEET_ID);
    }
  }, [isMobile, sidebarOpen]);

  // Collapse all expanded items on ESC
  useHotkeys([
    [
      'Escape',
      () => {
        if (sidebarOpen) {
          useSheeter.getState().remove(DOCS_SIDEBAR_SHEET_ID);
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
      useSheeter.getState().remove(DOCS_SIDEBAR_SHEET_ID);
    } else {
      useSheeter.getState().create(sidebarContent, {
        id: DOCS_SIDEBAR_SHEET_ID,
        side: 'left',
        triggerRef,
        className: 'w-72 p-0',
        showCloseButton: false,
        closeSheetOnRouteChange: false,
      });
    }
  };

  // Mobile layout with sheeter sidebar
  if (isMobile) {
    return (
      <div className="[--card:oklch(0.987_0.0013_285.76)] dark:[--card:oklch(0.232_0.0095_285.56)]">
        {/* Fixed mobile header */}
        <header
          className={`fixed top-0 left-0 right-0 z-80 h-13 bg-background/70 backdrop-blur-sm transition-transform duration-300 ${
            showHeader ? 'translate-y-0' : '-translate-y-full'
          }`}
        >
          <div className="flex h-full items-center gap-1 px-1">
            <Button
              ref={triggerRef}
              variant="ghost"
              size="icon"
              className="size-11"
              onClick={toggleSidebar}
              aria-label="Toggle menu"
            >
              <MenuIcon className="size-6" />
            </Button>
            <Link
              to="/docs"
              className="transition-transform hover:scale-105 active:scale-100 focus-effect rounded-md p-0.5"
              aria-label="Go to docs"
            >
              <Logo height={38} iconOnly />
            </Link>
          </div>
        </header>

        {/* Main content with top padding for fixed header */}
        <main className="container min-h-screen pt-20 pb-[70vh]">
          <Outlet />
        </main>
      </div>
    );
  }

  // Desktop layout with resizable panels
  return (
    <div className="h-screen [--card:oklch(0.987_0.0013_285.76)] dark:[--card:oklch(0.232_0.0095_285.56)]">
      <ResizableGroup orientation="horizontal" className="h-screen">
        <ResizablePanel defaultSize="20%" minSize="16rem" maxSize="40%">
          <div className="h-screen">
            <ScrollArea className="h-full w-full">{sidebarContent}</ScrollArea>
          </div>
        </ResizablePanel>

        <ResizableSeparator />

        <ResizablePanel>
          <main className="h-screen pt-3 sm:pt-6 overflow-auto">
            <div className="container pb-[70vh]">
              <Outlet />
            </div>
          </main>
        </ResizablePanel>
      </ResizableGroup>
    </div>
  );
};

export default DocsLayout;
