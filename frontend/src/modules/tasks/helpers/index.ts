import type { Edge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/types';
import { impacts } from '~/modules/tasks/task-selectors/select-impact';
import { taskStatuses } from '~/modules/tasks/task-selectors/select-status';
import type { Project, SubTask, Task } from '~/types/app';
import { recentlyUsed } from '~/utils/utils';

export const getRelativeTaskOrder = (edge: Edge, tasks: Task[], order: number, id: string, parentId?: string, status?: number) => {
  let filteredTasks: Task[] | SubTask[] = [];

  if (parentId) filteredTasks = tasks.find((t) => t.id === parentId)?.subTasks || [];
  if (status) filteredTasks = tasks.filter((t) => t.status === status).sort((a, b) => b.order - a.order);
  const relativeTask = filteredTasks.find((t) =>
    parentId ? (edge === 'top' ? t.order < order : t.order > order) : edge === 'top' ? t.order > order : t.order < order,
  );
  let newOrder: number;

  if (!relativeTask || relativeTask.order === order) {
    if (parentId) newOrder = edge === 'top' ? order / 2 : order + 1;
    else newOrder = edge === 'top' ? order + 1 : order / 2;
  } else if (relativeTask.id === id) {
    newOrder = relativeTask.order;
  } else {
    newOrder = (relativeTask.order + order) / 2;
  }
  return newOrder;
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
    .filter((t) => t.status === newStatus && (t.status !== 6 || recentlyUsed(t.modifiedAt, 30)))
    .sort((a, b) => sortTaskOrder(a, b, direction > 0));
  return task ? (direction > 0 ? task.order / 2 : task.order + 1) : 1;
};

// return task order for new created Tasks
export const getNewTaskOrder = (status: number, tasks: Task[] | SubTask[]) => {
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

// return if task is expandable or not
export const taskExpandable = (summary: string, description: string) => {
  const parser = new DOMParser();
  //Parse the HTML and extract text content
  const summaryDoc = parser.parseFromString(summary, 'text/html');
  const descriptionDoc = parser.parseFromString(description, 'text/html');

  const summaryText = summaryDoc.body.textContent || '';
  const descriptionText = descriptionDoc.body.textContent || '';
  if (descriptionText.length === summaryText.length) return summaryText !== descriptionText;

  return true;
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
    if (task.status === 6 && recentlyUsed(task.modifiedAt, 30)) acceptedCount += 1;
    if (task.status === 0) icedCount += 1;
    // Filter based on showAccepted in past 30 days and showIced
    if (showAccepted && recentlyUsed(task.modifiedAt, 30) && task.status === 6) return true;
    if (showIced && task.status === 0) return true;
    return task.status !== 0 && task.status !== 6;
  });
  // Sort subtasks within each task by order
  const tasksWithSortedSubtasks = filteredTasks.map((task) => ({
    ...task,
    subTasks: task.subTasks.sort((a, b) => a.order - b.order),
  }));

  // Sort the main tasks
  const sortedTasks = tasksWithSortedSubtasks.sort((a, b) => sortTaskOrder(a, b));

  return { sortedTasks, acceptedCount, icedCount };
};

export const configureForExport = (tasks: Task[], projects: Omit<Project, 'counts'>[]): Task[] => {
  const parser = new DOMParser();

  return tasks.map((task) => {
    //Parse the HTML and extract text content
    const summaryDoc = parser.parseFromString(task.summary, 'text/html');
    const summaryText = summaryDoc.body.textContent || '';

    const project = projects.find((p) => p.id === task.projectId);
    const subTaskCount = `${task.subTasks.filter((st) => st.status === 6).length} of ${task.subTasks.length}`;
    const impact = impacts[task.impact ?? 0];
    return {
      ...task,
      summary: summaryText,
      labels: task.labels.map((label) => label.name),
      status: taskStatuses[task.status].status,
      impact: impact.value,
      subTasks: task.subTasks.length ? subTaskCount : '-',
      projectId: project?.name ?? '-',
      createdBy: task.createdBy?.name ?? '-',
      modifiedBy: task.modifiedBy?.name ?? '-',
      assignedTo: task.assignedTo.map((m) => m.name) || '-',
    } as unknown as Task;
  });
};
