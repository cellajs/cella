import { Trash, XSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { deleteTasks } from '~/api/tasks';
import { useMutateQueryData } from '~/hooks/use-mutate-query-data';
import { taskKeys } from '~/modules/common/query-client-provider/tasks';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import type { Project, Workspace } from '~/types/app';

interface TaskSelectedButtonsProps {
  workspace: Workspace;
  projects: Project[];
  selectedTasks: string[];
  setSelectedTasks: (taskIds: string[]) => void;
}

const TaskSelectedButtons = ({ workspace, projects, selectedTasks, setSelectedTasks }: TaskSelectedButtonsProps) => {
  const { t } = useTranslation();

  const removeSelect = () => setSelectedTasks([]);

  const onRemove = () => {
    deleteTasks(selectedTasks, workspace.organizationId)
      .then(async (resp) => {
        if (resp) {
          toast.success(t('common:success.delete_resources', { resources: t('app:tasks') }));

          for (const project of projects) {
            const callback = useMutateQueryData(taskKeys.list({ projectId: project.id, orgIdOrSlug: workspace.organizationId }));
            const newTasks = selectedTasks.map((el) => ({ id: el })) ?? [];
            callback(newTasks, 'delete');
          }

          removeSelect();
        }
        if (!resp) toast.error(t('common:error.delete_resources', { resources: t('app:tasks') }));
      })
      .catch(() => {
        toast.error(t('common:error.delete_resources', { resources: t('app:tasks') }));
      });
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
        <Button variant="ghost" className="relative" onClick={removeSelect}>
          <XSquare size={16} />
          <span className="ml-1 max-xs:hidden">{t('common:clear')}</span>
        </Button>
      </TooltipButton>
    </div>
  );
};

export default TaskSelectedButtons;
