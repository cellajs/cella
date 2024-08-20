import type { Project, Task } from '~/types';
import { impacts } from '../task-selectors/select-impact';
import { taskStatuses } from '../task-selectors/select-status';

export const configureForExport = (tasks: Task[], projects: Omit<Project, 'counts'>[]) => {
  return tasks.map((task) => {
    const project = projects.find((p) => p.id === task.projectId);
    const subTaskCount = `${task.subTasks.filter((st) => st.status === 6).length} of ${task.subTasks.length}`;
    const impact = impacts[task.impact ?? 0];
    return {
      ...task,
      summary: task.summary.replace('<p class="bn-inline-content">', '').replace('</p>', ''),
      labels: task.labels.map((label) => label.name),
      status: taskStatuses[task.status].status,
      impact: impact.value,
      subTasks: task.subTasks.length ? subTaskCount : '-',
      projectId: project?.name ?? '-',
      createdBy: task.createdBy?.name ?? '-',
      modifiedBy: task.modifiedBy?.name ?? '-',
      assignedTo: task.assignedTo.map((m) => m.name) || '-',
    };
  });
};
