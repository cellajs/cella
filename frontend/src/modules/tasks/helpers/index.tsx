import type { Edge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/types';
import type { NavigateFn } from '@tanstack/react-router';
import { t } from 'i18next';
import { Suspense, lazy } from 'react';
import { dispatchCustomEvent } from '~/lib/custom-events';
import { dropdowner } from '~/modules/common/dropdowner/state';
import { orderChange } from '~/modules/common/nav-sheet/helpers';
import { sheet } from '~/modules/common/sheeter/state';
import type { TaskImpact, TaskType } from '~/modules/tasks/create-task-form';
import SelectImpact, { impacts } from '~/modules/tasks/task-dropdowns/select-impact';
import SetLabels from '~/modules/tasks/task-dropdowns/select-labels';
import AssignMembers from '~/modules/tasks/task-dropdowns/select-members';
import SelectStatus, { taskStatuses, type TaskStatus } from '~/modules/tasks/task-dropdowns/select-status';
import SelectTaskType from '~/modules/tasks/task-dropdowns/select-task-type';
import type { Mode } from '~/store/theme';
import { useWorkspaceStore } from '~/store/workspace';
import type { Project, Subtask, Task } from '~/types/app';
import { dateIsRecent } from '~/utils/date-is-recent';

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

export const getRelativeTaskOrder = (edge: Edge, tasks: Task[], order: number, id: string, parentId?: string, status?: number) => {
  // Filter tasks based on status, if provided
  let filteredTasks: Task[] | Subtask[] = status ? tasks.filter((t) => t.status === status) : tasks;

  // If parentId exists, filter for subtasks and sort accordingly
  if (parentId) filteredTasks = tasks.find((t) => t.id === parentId)?.subtasks || [];

  const isEdgeTop = edge === 'top';
  const sortFunc = parentId ? sortSubtaskOrder : sortTaskOrder;
  // Sort based on task or subtask order
  filteredTasks.sort((a, b) => sortFunc(a, b, isEdgeTop));

  // Find the relative task based on the order
  const relativeTask = filteredTasks.find((t) => {
    if (parentId) return isEdgeTop ? t.order < order : t.order > order;
    return isEdgeTop ? t.order > order : t.order < order;
  });

  let newOrder: number;

  // Determine new order based on relative task presence and conditions
  if (!relativeTask || relativeTask.order === order) {
    newOrder = parentId ? orderChange(order, isEdgeTop ? 'dec' : 'inc') : orderChange(order, isEdgeTop ? 'inc' : 'dec');
  } else if (relativeTask.id === id) {
    newOrder = relativeTask.order;
  } else {
    newOrder = (relativeTask.order + order) / 2;
  }
  return newOrder;
};

// To sort Subtasks by its order
const sortSubtaskOrder = (task1: Pick<Task, 'order'>, task2: Pick<Task, 'order'>, reverse?: boolean) => {
  if (task1.order !== null && task2.order !== null) return reverse ? task2.order - task1.order : task1.order - task2.order;
  // order is null
  return 0;
};

// To sort Tasks by its status & order
const sortTaskOrder = (task1: Pick<Task, 'status' | 'order'>, task2: Pick<Task, 'status' | 'order'>, reverse?: boolean) => {
  if (task1.status !== task2.status) return task2.status - task1.status;
  // same status, sort by order
  if (task1.order !== null && task2.order !== null) return reverse ? task1.order - task2.order : task2.order - task1.order;
  // order is null
  return 0;
};

// return task order for task status
export const getNewStatusTaskOrder = (oldStatus: number, newStatus: number, tasks: Task[]) => {
  const direction = newStatus - oldStatus;
  const [task] = tasks
    .filter((t) => t.status === newStatus && (t.status !== 6 || dateIsRecent(t.modifiedAt, 30)))
    .sort((a, b) => sortTaskOrder(a, b, direction > 0));
  return task ? orderChange(task.order, direction > 0 ? 'dec' : 'inc') : 0.1;
};

// return task order for new created Tasks
export const getNewTaskOrder = (status: number, tasks: Task[] | Subtask[]) => {
  const filteredTasks = tasks.filter((t) => t.status === status).sort((a, b) => b.order - a.order);
  return filteredTasks.length > 0 ? filteredTasks[0].order + 1 : 1;
};

// retrieve unique words from task description
export const extractUniqueWordsFromHTML = (html: string) => {
  //Parse the HTML and extract text content
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const text = doc.body.textContent || '';

  // Split the text into words, normalize them, and remove non-alphanumeric characters
  const words = text
    .split(/\s+/)
    .map((word) => word.toLowerCase())
    .map((word) => word.replace(/[^a-z0-9]/g, ''))
    .filter((word) => word.length > 0);

  //Filter out duplicate words
  const uniqueWords = [...new Set(words)];

  return uniqueWords.join(' ');
};

export const inNumbersArray = (arrayLen: number, number: string) => {
  const array = [...Array(arrayLen).keys()].map((i) => i + 1);

  return array.includes(Number.parseInt(number));
};

export const sortAndGetCounts = (tasks: Task[], showAccepted: boolean, showIced: boolean) => {
  let acceptedCount = 0;
  let icedCount = 0;

  const filteredTasks = tasks.filter((task) => {
    // Count accepted in past 30 days and iced tasks
    if (task.status === 6) acceptedCount += 1;
    if (task.status === 0) icedCount += 1;
    // Filter based on showAccepted in past 30 days and showIced
    if (showAccepted && task.status === 6) return true;
    if (showIced && task.status === 0) return true;
    return task.status !== 0 && task.status !== 6;
  });

  // Sort the main tasks
  const sortedTasks = filteredTasks.sort((a, b) => sortTaskOrder(a, b));

  return { sortedTasks, acceptedCount, icedCount };
};

export const configureForExport = (tasks: Task[], projects: Omit<Project, 'counts'>[]): Task[] => {
  const parser = new DOMParser();

  return tasks.map((task) => {
    //Parse the HTML and extract text content
    const summaryDoc = parser.parseFromString(task.summary, 'text/html');
    const summaryText = summaryDoc.body.textContent || '';

    const project = projects.find((p) => p.id === task.projectId);
    const subtaskCount = `${task.subtasks.filter((st) => st.status === 6).length} of ${task.subtasks.length}`;
    const impact = impacts[task.impact ?? 0];
    return {
      ...task,
      summary: summaryText,
      labels: task.labels.map((label) => label.name),
      status: taskStatuses[task.status].status,
      impact: impact.value,
      subtasks: task.subtasks.length ? subtaskCount : '-',
      projectId: project?.name ?? '-',
      createdBy: task.createdBy?.name ?? '-',
      modifiedBy: task.modifiedBy?.name ?? '-',
      assignedTo: task.assignedTo.map((m) => m.name) || '-',
    } as unknown as Task;
  });
};

export const trimInlineContentText = (descriptionHtml: string) => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(descriptionHtml, 'text/html');

  // Select all elements with the class 'bn-inline-content'
  const inlineContents = doc.querySelectorAll('.bn-inline-content');

  for (const element of inlineContents) {
    // Trim the text and update the element's content
    if (element.textContent) element.textContent = element.textContent.trim();
  }
  return doc.body.innerHTML;
};

export const handleEditorFocus = (id: string, taskToClose?: string | null) => {
  // Remove subtask editing state
  dispatchCustomEvent('changeSubtaskState', { taskId: id, state: 'removeEditing' });
  // Remove Task editing state if focused not task itself
  if (taskToClose) dispatchCustomEvent('changeTaskState', { taskId: taskToClose, state: 'currentState' });
};
