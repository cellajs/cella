import type { NavigateFn } from '@tanstack/react-router';
import { t } from 'i18next';
import { Suspense, lazy } from 'react';
import { dropdowner } from '~/modules/common/dropdowner/state';
import { sheet } from '~/modules/common/sheeter/state';
import type { TaskImpact, TaskType } from '~/modules/tasks/create-task-form';
import SelectImpact from '~/modules/tasks/task-selectors/select-impact';
import SetLabels from '~/modules/tasks/task-selectors/select-labels';
import AssignMembers from '~/modules/tasks/task-selectors/select-members';
import SelectStatus, { type TaskStatus } from '~/modules/tasks/task-selectors/select-status';
import SelectTaskType from '~/modules/tasks/task-selectors/select-task-type';
import type { Mode } from '~/store/theme';
import { useWorkspaceStore } from '~/store/workspace';
import type { Task } from '~/types/app';

const TaskCard = lazy(() => import('~/modules/tasks/task'));

export const openTaskPreviewSheet = (task: Task, mode: Mode, navigate: NavigateFn, addSearch = false) => {
  if (addSearch) {
    navigate({
      to: '.',
      replace: true,
      resetScroll: false,
      search: (prev) => ({
        ...prev,
        ...{ taskIdPreview: task.id },
      }),
    });
  }
  sheet.create(
    <Suspense>
      <TaskCard mode={mode} task={task} state="editing" isSelected={false} isFocused={true} isSheet />
    </Suspense>,
    {
      className: 'max-w-full lg:max-w-4xl px-0',
      title: <span className="px-4">{t('app:task')}</span>,
      id: `task-preview-${task.id}`,
      hideClose: false,
      side: 'right',
      removeCallback: () => {
        navigate({
          to: '.',
          replace: true,
          resetScroll: false,
          search: (prev) => {
            const { taskIdPreview: _, ...nextSearch } = prev;
            return nextSearch;
          },
        });
        sheet.remove(`task-preview-${task.id}`);
      },
    },
  );
  setTaskCardFocus(`sheet-card-${task.id}`);
};

export const setTaskCardFocus = (id: string) => {
  const taskCard = document.getElementById(id);
  if (taskCard && document.activeElement !== taskCard) taskCard.focus();
  useWorkspaceStore.setState((state) => {
    state.focusedTaskId = id;
  });
};

export const handleTaskDropDownClick = (task: Task, field: string, trigger: HTMLElement) => {
  let component = <SelectTaskType currentType={task.type as TaskType} projectId={task.projectId} />;
  if (field.includes('impact')) component = <SelectImpact value={task.impact as TaskImpact} projectId={task.projectId} />;
  else if (field.includes('labels')) component = <SetLabels value={task.labels} organizationId={task.organizationId} projectId={task.projectId} />;
  else if (field.includes('assignedTo')) component = <AssignMembers projectId={task.projectId} value={task.assignedTo} />;
  else if (field.includes('status')) component = <SelectStatus taskStatus={task.status as TaskStatus} projectId={task.projectId} />;
  return dropdowner(component, { id: field, trigger, align: field.startsWith('status') || field.startsWith('assignedTo') ? 'end' : 'start' });
};
