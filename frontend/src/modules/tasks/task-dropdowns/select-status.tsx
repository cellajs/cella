import { useLocation, useSearch } from '@tanstack/react-router';
import { cva } from 'class-variance-authority';
import { Check, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { queryClient } from '~/lib/router';
import { dropdowner } from '~/modules/common/dropdowner/state';
import { Kbd } from '~/modules/common/kbd';
import { taskKeys, useTaskUpdateMutation } from '~/modules/common/query-client-provider/tasks';
import { getNewStatusTaskOrder, inNumbersArray } from '~/modules/tasks/helpers';
import { AcceptedIcon } from '~/modules/tasks/task-dropdowns/status-icons/accepted';
import { DeliveredIcon } from '~/modules/tasks/task-dropdowns/status-icons/delivered';
import { FinishedIcon } from '~/modules/tasks/task-dropdowns/status-icons/finished';
import { IcedIcon } from '~/modules/tasks/task-dropdowns/status-icons/iced';
import { ReviewedIcon } from '~/modules/tasks/task-dropdowns/status-icons/reviewed';
import { StartedIcon } from '~/modules/tasks/task-dropdowns/status-icons/started';
import { UnstartedIcon } from '~/modules/tasks/task-dropdowns/status-icons/unstarted';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '~/modules/ui/command';
import { useWorkspaceQuery } from '~/modules/workspaces/helpers/use-workspace';
import { WorkspaceRoute } from '~/routes/workspaces';
import { useWorkspaceStore } from '~/store/workspace';
import type { Task } from '~/types/app';

export const taskStatuses = [
  { value: 0, action: 'iced', status: 'iced', icon: IcedIcon },
  { value: 1, action: 'start', status: 'unstarted', icon: UnstartedIcon },
  { value: 2, action: 'finish', status: 'started', icon: StartedIcon },
  { value: 3, action: 'deliver', status: 'finished', icon: FinishedIcon },
  { value: 4, action: 'review', status: 'delivered', icon: DeliveredIcon },
  { value: 5, action: 'accept', status: 'reviewed', icon: ReviewedIcon },
  { value: 6, action: 'accepted', status: 'accepted', icon: AcceptedIcon },
] as const;

interface Query {
  pages?: {
    items: Task[];
  }[];
  items?: Task[];
}

type Status = {
  value: (typeof taskStatuses)[number]['value'];
  status: string;
  action: string;
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  icon: React.ElementType<any>;
};

export type TaskStatus = (typeof taskStatuses)[number]['value'];

export const statusTextColors = {
  0: 'text-sky-500',
  1: 'text-slate-500',
  2: 'text-regular',
  3: 'text-lime-500',
  4: 'text-yellow-500',
  5: 'text-orange-500',
  6: 'text-green-500',
};

export const statusFillColors = {
  0: 'fill-sky-500',
  1: 'fill-slate-500',
  2: 'fill-regular',
  3: 'fill-lime-500',
  4: 'fill-yellow-500',
  5: 'fill-orange-500',
  6: 'fill-green-500',
};

export const statusVariants = cva('', {
  variants: {
    status: {
      0: 'bg-background/50 border-sky-500/40 hover:bg-sky-500/10 hover:border-sky-500/60 text-sky-600',
      1: '',
      2: 'bg-background/50 border-slate-500/40 hover:bg-slate-500/10 hover:border-slate-500/60',
      3: 'bg-background/50 border-lime-500/40 hover:bg-lime-500/10 hover:border-lime-500/60',
      4: 'bg-background/50 border-yellow-500/40 hover:bg-yellow-500/10 hover:border-yellow-500/60',
      5: 'bg-background/50 border-orange-500/40 hover:bg-orange-500/10 hover:border-orange-500/60',
      6: 'bg-background/50 border-green-500/40 hover:bg-green-500/10 hover:border-green-500/60 text-green-600',
    },
  },
});

const SelectStatus = ({
  taskStatus,
  projectId,
  creationValueChange,
}: { taskStatus: TaskStatus; projectId: string; creationValueChange?: (newValue: number) => void }) => {
  const { t } = useTranslation();

  const { pathname } = useLocation();
  const { focusedTaskId: storeFocusedId } = useWorkspaceStore();
  const tableSearch = useSearch({
    from: WorkspaceRoute.id,
  });
  const {
    data: { workspace, projects },
  } = useWorkspaceQuery();
  const [searchValue, setSearchValue] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<Status>(taskStatuses[taskStatus]);
  const taskMutation = useTaskUpdateMutation();

  const focusedTaskId = useMemo(
    () => (tableSearch.taskIdPreview ? tableSearch.taskIdPreview : storeFocusedId),
    [storeFocusedId, tableSearch.taskIdPreview],
  );

  const showedStatuses = useMemo(() => {
    if (searchValue.length) return taskStatuses.filter((s) => s.status.includes(searchValue.toLowerCase()));
    return taskStatuses;
  }, [searchValue]);

  const changeTaskStatus = async (newStatus: number) => {
    if (creationValueChange) creationValueChange(newStatus);
    if (!focusedTaskId) return;
    try {
      const isTable = pathname.includes('/table');
      const queryKeys = !isTable
        ? taskKeys.list({ projectId, orgIdOrSlug: workspace.organizationId })
        : taskKeys.list({
            projectId: projectId ?? projects.map((p) => p.id).join('_'),
            orgIdOrSlug: workspace.organizationId,
            status: tableSearch.status,
            q: tableSearch.q,
            sort: tableSearch.sort,
            order: tableSearch.order,
          });

      const query: Query | undefined = queryClient.getQueryData(queryKeys);
      const tasks: Task[] = query ? (isTable ? query.pages?.[0]?.items || [] : query.items || []) : [];
      const newOrder = getNewStatusTaskOrder(taskStatus, newStatus, tasks);
      await taskMutation.mutateAsync({
        id: focusedTaskId,
        orgIdOrSlug: workspace.organizationId,
        key: 'status',
        data: newStatus,
        order: newOrder,
        projectId,
      });
    } catch (err) {
      toast.error(t('common:error.update_resource', { resource: t('app:task') }));
    }
  };

  const statusChange = (newValue: number) => {
    const newStatus = taskStatuses.find((s) => s.value === newValue);
    if (!newStatus) return;
    setSelectedStatus(newStatus);
    changeTaskStatus(newValue);
  };

  const handleStatusChangeClick = (status: number) => {
    statusChange(status);
    dropdowner.remove();
    setSearchValue('');
  };

  useEffect(() => {
    setSelectedStatus(taskStatuses[taskStatus]);
  }, [taskStatus]);

  return (
    <Command className="relative rounded-lg w-60">
      <CommandInput
        className="leading-normal focus-visible:ring-transparent border-t-0 border-x-0 border-b-1 rounded-none max-sm:hidden"
        placeholder={t('app:placeholder.set_status')}
        value={searchValue}
        autoFocus={true}
        onValueChange={(searchValue) => {
          // If the user types a number, select status like useHotkeys
          if (inNumbersArray(7, searchValue)) return handleStatusChangeClick(Number.parseInt(searchValue) - 1);
          setSearchValue(searchValue);
        }}
      />

      {!searchValue.length ? (
        <Kbd value="S" className="max-sm:hidden absolute top-3 right-2.5" />
      ) : (
        <XCircle
          size={16}
          className="absolute top-5 right-2.5 opacity-70 hover:opacity-100 -translate-y-1/2 cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            setSearchValue('');
          }}
        />
      )}
      <CommandList>
        {!!searchValue.length && (
          <CommandEmpty className="flex text-muted justify-center items-center p-2 text-sm">
            {t('common:no_resource_found', { resource: t('app:status').toLowerCase() })}
          </CommandEmpty>
        )}
        <CommandGroup>
          {showedStatuses.map((status, index) => (
            <CommandItem
              key={status.value}
              value={status.status}
              onSelect={() => handleStatusChangeClick(status.value)}
              className="group rounded-md flex gap-2 justify-between items-center w-full leading-normal"
            >
              <status.icon
                className={`size-4 mr-2 fill-current ${selectedStatus.value === status.value ? 'opacity-100' : 'opacity-50'} group-hover:opacity-100 ${statusFillColors[status.value] || ''}`}
              />
              <div className="grow">{t(`app:${status.status}`)}</div>
              <Check size={16} className={`text-success ${selectedStatus.value !== status.value && 'invisible'}`} />
              {!searchValue && <span className="max-sm:hidden text-xs opacity-50 mx-1">{index + 1}</span>}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );
};

export default SelectStatus;
