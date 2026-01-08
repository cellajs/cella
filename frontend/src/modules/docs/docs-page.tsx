import { Outlet, useLoaderData } from '@tanstack/react-router';
import { operations, tags } from '~/api.gen/docs';
import { DocsSidebar } from '~/modules/docs/docs-sidebar';
import { ResizableGroup, ResizablePanel, ResizableSeparator } from '~/modules/ui/resizable';
import { ScrollArea } from '~/modules/ui/scroll-area';
import { DocsRoute } from '~/routes/docs-routes';

const DocsPage = () => {
  const { pagesCollection } = useLoaderData({ from: DocsRoute.id });

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

export default DocsPage;
