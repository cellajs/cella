import { Outlet } from '@tanstack/react-router';
import { operations, tags } from '~/api.gen/docs';
import { DocsSidebar } from '~/modules/docs/docs-sidebar';
import { ResizableGroup, ResizablePanel, ResizableSeparator } from '~/modules/ui/resizable';
import { ScrollArea } from '~/modules/ui/scroll-area';

const DocsPage = () => {
  return (
    <ResizableGroup orientation="horizontal" className="h-screen">
      <ResizablePanel defaultSize="20%" className="border-r">
        <div className="h-screen">
          <ScrollArea className="h-full w-full">
            <DocsSidebar operations={operations} tags={tags} />
          </ScrollArea>
        </div>
      </ResizablePanel>

      <ResizableSeparator withHandle />

      <ResizablePanel>
        <main className="h-screen overflow-auto p-6">
          <div className="">
            <Outlet />
          </div>
        </main>
      </ResizablePanel>
    </ResizableGroup>
  );
};

export default DocsPage;
