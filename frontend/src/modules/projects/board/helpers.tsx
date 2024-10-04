import { t } from 'i18next';
import { SheetNav } from '~/modules/common/sheet-nav';
import { sheet } from '~/modules/common/sheeter/state';
import MembersTable from '~/modules/organizations/members-table';
import { ProjectSettings } from '~/modules/projects/project-settings';
import type { Project, SubTask, Task } from '~/types/app';
import type { DraggableItemData } from '~/types/common';

export type TaskDraggableItemData = DraggableItemData<Task> & { type: 'task' };
export type SubTaskDraggableItemData = DraggableItemData<SubTask> & { type: 'subTask' };

export const isTaskData = (data: Record<string | symbol, unknown>): data is TaskDraggableItemData => {
  return data.dragItem === true && typeof data.order === 'number' && data.type === 'task';
};
export const isSubTaskData = (data: Record<string | symbol, unknown>): data is SubTaskDraggableItemData => {
  return data.dragItem === true && typeof data.order === 'number' && data.type === 'subTask';
};

export const openProjectConfigSheet = (project: Project) => {
  const isAdmin = project.membership?.role === 'admin';
  const projectTabs = [
    ...(isAdmin
      ? [
          {
            id: 'general',
            label: 'common:general',
            element: <ProjectSettings project={project} sheet />,
          },
        ]
      : []),
    {
      id: 'members',
      label: 'common:members',
      element: <MembersTable entity={project} isSheet />,
    },
  ];

  sheet.create(<SheetNav tabs={projectTabs} />, {
    className: 'max-w-full lg:max-w-4xl',
    id: isAdmin ? 'edit-project' : 'project-members',
    title: isAdmin ? t('common:resource_settings', { resource: t('app:project') }) : t('app:project_members'),
    text: isAdmin ? t('common:resource_settings.text', { resource: t('app:project').toLowerCase() }) : '',
  });
};
