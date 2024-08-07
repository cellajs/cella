import { Trash, XSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '~/modules/ui/button';
import { useWorkspaceStore } from '~/store/workspace';
import { useElectric } from '~/modules/common/electric/electrify';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { Badge } from '~/modules/ui/badge';

const TaskSelectedTableButtons = () => {
  const { t } = useTranslation();
  const { selectedTasks, setSelectedTasks } = useWorkspaceStore();

  const electric = useElectric();

  const onRemove = () => {
    if (!electric) return toast.error(t('common:local_db_inoperable'));

    // Delete child tasks first
    electric.db.tasks
      .deleteMany({
        where: {
          parent_id: {
            in: selectedTasks,
          },
        },
      })
      .then(() => {
        // Then delete parent tasks
        electric.db.tasks
          .deleteMany({
            where: {
              id: {
                in: selectedTasks,
              },
            },
          })
          .then(() => {
            toast.success(t('common:success.delete_resources', { resources: t('common:tasks') }));
            setSelectedTasks([]);
          });
      });
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
