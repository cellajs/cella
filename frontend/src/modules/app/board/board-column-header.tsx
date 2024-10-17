import { useNavigate, useParams } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '~/modules/ui/button';
import { useWorkspaceQuery } from '~/modules/workspaces/helpers/use-workspace';
import { cn } from '~/utils/cn';

export function BoardColumnHeader({ projectId, children }: { projectId: string; children?: React.ReactNode }) {
  const navigate = useNavigate();
  const {
    data: { projects },
  } = useWorkspaceQuery();
  const currentIndex = projects.findIndex((p) => p.id === projectId);

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
    <div
      className={cn(
        'sm:border p-1 sm:p-3 rounded-lg rounded-b-none text-normal leading-4 flex flex-row gap-1 sm:gap-2 space-between items-center',
        stickyStyles,
      )}
    >
      <Button disabled={currentIndex === 0} variant="ghost" className="sm:hidden" onClick={() => ArrowClick('left')}>
        <ChevronLeft size={16} />
      </Button>

      <div className="grow sm:hidden" />
      {children}
      <Button disabled={currentIndex === projects.length - 1} variant="ghost" className="sm:hidden" onClick={() => ArrowClick('right')}>
        <ChevronRight size={16} />
      </Button>
    </div>
  );
}
