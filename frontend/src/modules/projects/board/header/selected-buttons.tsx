import { useLocation } from '@tanstack/react-router';
import { Trash, XSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { deleteTasks } from '~/api/tasks';
import { dispatchCustomEvent } from '~/lib/custom-events';
import { queryClient } from '~/lib/router';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { useWorkspaceStore } from '~/store/workspace';
import type { Task } from '~/types/app';

const TaskSelectedTableButtons = () => {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { selectedTasks, setSelectedTasks, workspace } = useWorkspaceStore();

  const queries = queryClient.getQueriesData({ queryKey: ['boardTasks'] });

  const onRemove = () => {
    deleteTasks(selectedTasks, workspace.organizationId)
      .then((resp) => {
        if (resp) {
          toast.success(t('common:success.delete_resources', { resources: t('app:tasks') }));
          const tasks = queries.flatMap((el) => {
            const [, data] = el as [string[], undefined | { items: Task[] }];
            return data?.items ?? [];
          });
          const selectedIds = selectedTasks.map((id) => ({ id }));
          const projectIds = [...new Set(tasks.filter((t) => selectedTasks.includes(t.id)).map((t) => t.projectId))];
          if (!pathname.includes('/board')) {
            dispatchCustomEvent('taskTableOperation', { array: selectedIds, action: 'delete' });
          } else {
            projectIds.map((projectId) => {
              dispatchCustomEvent('taskOperation', { array: selectedIds, action: 'delete', projectId });
            });
          }
          setSelectedTasks([]);
        }
        if (!resp) toast.error(t('common:error.delete_resources', { resources: t('app:tasks') }));
      })
      .catch(() => toast.error(t('common:error.delete_resources', { resources: t('app:tasks') })));
  };

  return (
    <div className="inline-flex align-center items-center gap-2">
      <TooltipButton toolTipContent={t('app:remove_task')}>
        <Button variant="destructive" className="relative" onClick={onRemove}>
          <Badge className="py-0 px-1 absolute -right-2 min-w-5 flex justify-center -top-1.5 shadow-sm">{selectedTasks.length}</Badge>
          <Trash size={16} />
          <span className="ml-1 max-xs:hidden">{t('common:remove')}</span>
        </Button>
      </TooltipButton>
      <TooltipButton toolTipContent={t('common:clear_selection')}>
        <Button variant="ghost" className="relative" onClick={() => setSelectedTasks([])}>
          <XSquare size={16} />
          <span className="ml-1 max-xs:hidden">{t('common:clear')}</span>
        </Button>
      </TooltipButton>
    </div>
  );
};

export default TaskSelectedTableButtons;
