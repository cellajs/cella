import { useLocation } from '@tanstack/react-router';
import { Trash, XSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { deleteTasks } from '~/api/tasks';
import { dispatchCustomEvent } from '~/lib/custom-events.ts';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { useWorkspaceStore } from '~/store/workspace';

const TaskSelectedTableButtons = () => {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { selectedTasks, setSelectedTasks } = useWorkspaceStore();

  const onRemove = () => {
    deleteTasks(selectedTasks)
      .then((resp) => {
        if (resp) {
          toast.success(t('common:success.delete_resources', { resources: t('common:tasks') }));
          setSelectedTasks([]);
          const eventName = pathname.includes('/board') ? 'taskCRUD' : 'taskTableCRUD';
          dispatchCustomEvent(eventName, {
            array: selectedTasks.map((id) => {
              return {
                id,
              };
            }),
            action: 'delete',
          });
        }
        if (!resp) toast.error(t('common:error.delete_resources', { resources: t('common:tasks') }));
      })
      .catch(() => toast.error(t('common:error.delete_resources', { resources: t('common:tasks') })));
  };

  return (
    <div className="inline-flex align-center items-center gap-2">
      <TooltipButton toolTipContent={t('common:remove_task')}>
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
