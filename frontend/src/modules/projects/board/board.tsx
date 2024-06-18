import { type Edge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { arrayMove, getReorderDestinationIndex, sortById, updateOrderInMembership } from '~/lib/utils';
import { useWorkspaceContext } from '~/modules/workspaces/workspace-context';
import { useNavigationStore } from '~/store/navigation';
import type { Project } from '~/types';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '../../ui/resizable';
import { BoardColumn, isProjectData } from './board-column';

const PANEL_MIN_WIDTH = 300;
// Allow resizing of panels
const EMPTY_SPACE_WIDTH = 300;

function getScrollerWidth(containerWidth: number, projectsLength: number) {
  if (containerWidth === 0) return '100%';
  return containerWidth / projectsLength > PANEL_MIN_WIDTH ? '100%' : projectsLength * PANEL_MIN_WIDTH + EMPTY_SPACE_WIDTH;
}

function BoardDesktop({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const { projects } = useWorkspaceContext(({ projects }) => ({ projects }));
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(() => containerRef.current?.clientWidth ?? 0);
  const scrollerWidth = getScrollerWidth(containerWidth, projects.length);
  const panelMinSize = typeof scrollerWidth === 'number' ? (PANEL_MIN_WIDTH / scrollerWidth) * 100 : 100 / (projects.length + 1); // + 1 so that the panel can be resized to be bigger or smaller

  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div className="h-[calc(100vh-64px-64px)] transition md:h-[calc(100vh-88px)] overflow-x-auto" ref={containerRef}>
      <div className="h-[inherit]" style={{ width: scrollerWidth }}>
        <ResizablePanelGroup direction="horizontal" className="flex gap-2 group/board" id="project-panels" autoSaveId={workspaceId}>
          {projects.map((project, index) => (
            <Fragment key={project.id}>
              <ResizablePanel key={project.id} id={project.id} order={index} minSize={panelMinSize}>
                <BoardColumn key={project.id} project={project} />
              </ResizablePanel>
              {projects.length > index + 1 && (
                <ResizableHandle className="w-[6px] rounded border border-background -mx-[7px] bg-transparent hover:bg-primary/50 data-[resize-handle-state=drag]:bg-primary transition-all" />
              )}
            </Fragment>
          ))}
        </ResizablePanelGroup>
      </div>
    </div>
  );
}

export default function Board() {
  const { workspace, projects } = useWorkspaceContext(({ workspace, projects }) => ({
    workspace,
    projects,
  }));
  const { menuOrder, setSubMenuOrder, menu } = useNavigationStore();
  const [mappedProjects, setMappedProjects] = useState<Project[]>(
    projects.sort((a, b) => sortById(a.id, b.id, menuOrder.PROJECT.subList[workspace.id])),
  );
  const isDesktopLayout = useBreakpoints('min', 'sm');

  const currentWorkspace = useMemo(() => {
    return menu.workspaces.find((w) => w.id === workspace.id);
  }, [menu.workspaces, workspace.id]);

  useEffect(() => {
    //Fix types
    if (currentWorkspace) {
      const currentActiveProjects = currentWorkspace.submenu?.filter((p) => !p.membership.archived) as unknown as Project[];
      if (!currentActiveProjects) return setMappedProjects(projects);
      setMappedProjects(currentActiveProjects.sort((a, b) => sortById(a.id, b.id, menuOrder.PROJECT.subList[workspace.id])));
    }
  }, [currentWorkspace, menuOrder.PROJECT, workspace.id]);

  useEffect(() => {
    return combine(
      monitorForElements({
        canMonitor({ source }) {
          return source.data.type === 'column';
        },
        async onDrop({ location, source }) {
          const target = location.current.dropTargets[0];
          const sourceData = source.data;
          if (!target) return;

          // Drag a column
          if (isProjectData(sourceData) && isProjectData(target.data)) {
            const closestEdgeOfTarget: Edge | null = extractClosestEdge(target.data);
            const destination = getReorderDestinationIndex(sourceData.index, closestEdgeOfTarget, target.data.index, 'horizontal');
            const newItemOrder = arrayMove(menuOrder.PROJECT.subList[workspace.id], sourceData.index, destination);
            setSubMenuOrder('PROJECT', workspace.id, newItemOrder);
            // strange counts of the item
            if (sourceData.item.membership && currentWorkspace && currentWorkspace.submenu) {
              await updateOrderInMembership(currentWorkspace.submenu, target.data.index, sourceData.item.membership?.id);
            }
          }
        },
      }),
    );
  }, [menuOrder.PROJECT.subList[workspace.id]]);

  if (!isDesktopLayout) {
    return (
      <div className="flex flex-col gap-4">
        {mappedProjects.map((project) => (
          <BoardColumn key={project.id} project={project} />
        ))}
      </div>
    );
  }

  return <BoardDesktop workspaceId={workspace.id} />;
}
