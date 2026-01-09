import { Outlet, useLoaderData, useNavigate } from '@tanstack/react-router';
import { operations, tags } from '~/api.gen/docs';
import { useHotkeys } from '~/hooks/use-hot-keys';
import { DocsSidebar } from '~/modules/docs/docs-sidebar';
import { ResizableGroup, ResizablePanel, ResizableSeparator } from '~/modules/ui/resizable';
import { ScrollArea } from '~/modules/ui/scroll-area';
import { DocsLayoutRoute } from '~/routes/docs-routes';

const DocsLayout = () => {
  const navigate = useNavigate();

  const { pagesCollection } = useLoaderData({ from: DocsLayoutRoute.id });

  // Collapse all expanded items on ESC
  useHotkeys([
    [
      'Escape',
      () => {
        navigate({ to: '.', search: (prev) => ({ ...prev, tag: undefined }), resetScroll: false, replace: true });
      },
    ],
  ]);

  return (
    <ResizableGroup orientation="horizontal" className="h-screen">
      <ResizablePanel defaultSize="20%" className="border-r">
        <div className="h-screen">
          <ScrollArea className="h-full w-full">
            <DocsSidebar operations={operations} tags={tags} pagesCollection={pagesCollection} />
          </ScrollArea>
        </div>
      </ResizablePanel>

      <ResizableSeparator />

      <ResizablePanel>
        <main className="h-screen overflow-auto p-6 pb-[70vh]">
          <div className="">
            <Outlet />
          </div>
        </main>
      </ResizablePanel>
    </ResizableGroup>
  );
};

export default DocsLayout;
