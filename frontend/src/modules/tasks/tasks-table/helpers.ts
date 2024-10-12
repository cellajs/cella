import { impacts } from '~/modules/tasks/task-dropdowns/select-impact';
import { taskStatuses } from '~/modules/tasks/task-dropdowns/select-status';
import type { Project, Task } from '~/types/app';

export const configureForExport = (tasks: Task[], projects: Omit<Project, 'counts'>[]) => {
  return tasks.map((task) => {
    const project = projects.find((p) => p.id === task.projectId);
    const subtaskCount = `${task.subtasks.filter((st) => st.status === 6).length} of ${task.subtasks.length}`;
    const impact = impacts[task.impact ?? 0];
    return {
      ...task,
      summary: task.summary.replace('<p class="bn-inline-content">', '').replace('</p>', ''),
      labels: task.labels.map((label) => label.name),
      status: taskStatuses[task.status].status,
      impact: impact.value,
      subtasks: task.subtasks.length ? subtaskCount : '-',
      projectId: project?.name ?? '-',
      createdBy: task.createdBy?.name ?? '-',
      modifiedBy: task.modifiedBy?.name ?? '-',
      assignedTo: task.assignedTo.map((m) => m.name) || '-',
    };
  });
};
