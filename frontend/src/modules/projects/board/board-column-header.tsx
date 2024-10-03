import { useNavigate, useParams } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { Button } from '~/modules/ui/button';
import { useWorkspaceStore } from '~/store/workspace';
import type { Project } from '~/types/app';
import ProjectActions from './board-culumn-header-actions';

export function BoardColumnHeader({ project }: { project: Project }) {
  const navigate = useNavigate();
  const { projects } = useWorkspaceStore();
  const currentIndex = projects.findIndex((p) => p.id === project.id);

  const params = useParams({
    strict: false,
  });

  const ArrowClick = (side: 'left' | 'right') => {
    const targetIndex = currentIndex + (side === 'left' ? -1 : 1);
    const slug = projects[targetIndex].slug;
    navigate({
      to: '.',
      params,
      replace: true,
      search: (prev) => ({
        ...prev,
        ...{ project: slug },
      }),
    });
  };

  const stickyStyles = 'sticky sm:relative top-2 sm:top-0 bg-background z-50';

  return (
    <div className={`border p-3 rounded-lg rounded-b-none text-normal leading-4 flex flex-row gap-2 space-between items-center ${stickyStyles}`}>
      <Button disabled={currentIndex === 0} variant="plain" size="xs" className="rounded sm:hidden" onClick={() => ArrowClick('left')}>
        <ArrowLeft size={14} />
      </Button>
      <div className="grow sm:hidden" />
      <AvatarWrap className="h-6 w-6 text-xs" id={project.id} type="project" name={project.name} url={project.thumbnailUrl} />
      <div className="truncate leading-6">{project.name}</div>

      <ProjectActions project={project} />

      <Button
        disabled={currentIndex === projects.length - 1}
        variant="plain"
        size="xs"
        className="rounded sm:hidden"
        onClick={() => ArrowClick('right')}
      >
        <ArrowRight size={14} />
      </Button>
    </div>
  );
}
