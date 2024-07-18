import { nanoid } from 'nanoid';
import type { Labels, PivotalTask } from './type';

export const getSubTask = (task: PivotalTask, taskId: string, organizationId: string, projectId: string) => {
  const subtasks = [];
  for (let i = 0; i <= 27; i++) {
    const taskKey = `Task_${i}` as keyof PivotalTask;
    const statusKey = `Task Status_${i}` as keyof PivotalTask;
    if (task[taskKey] && task[statusKey]) {
      subtasks.push({
        id: nanoid(),
        slug: `${task.Id}_${i}`,
        summary: task[taskKey],
        type: 'chore' as const,
        parentId: taskId,
        createdBy: 'pivotal',
        organizationId: organizationId,
        projectId: projectId,
        impact: 0,
        markdown: task[taskKey],
        status: task[statusKey] === 'completed' ? 6 : 0,
        order: i,
        createdAt: new Date(),
      });
    }
  }
  return subtasks;
};

export const getLabels = (tasks: PivotalTask[], organizationId: string, projectId: string) => {
  const labels = tasks.flatMap((t) => t.Labels?.split(', ') || []).filter((l) => l?.length);
  const labelCounts = labels.reduce(
    (acc, label) => {
      if (label in acc) acc[label] += 1;
      else acc[label] = 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  const labelsToInsert = Object.entries(labelCounts).map(([key, value]) => ({
    id: nanoid(),
    name: key,
    color: '#FFA9BA',
    organizationId: organizationId,
    projectId: projectId,
    lastUsed: new Date(),
    useCount: value,
  }));
  return labelsToInsert;
};

export const getTaskLabels = (task: PivotalTask, labelsToInsert: Labels[]) => {
  const taskLabels = task.Labels?.split(', ').filter((l) => l?.length) || [];
  const labelsIds = taskLabels
    .map((taskLabel) => labelsToInsert.find((label) => label.name === taskLabel)?.id)
    .filter((id) => typeof id === 'string');
  return labelsIds;
};
