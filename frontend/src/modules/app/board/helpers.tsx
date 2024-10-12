import { t } from 'i18next';
import { SheetNav } from '~/modules/common/sheet-nav';
import { sheet } from '~/modules/common/sheeter/state';
import MembersTable from '~/modules/organizations/members-table';
import { ProjectSettings } from '~/modules/projects/project-settings';
import type { Project, Subtask, Task } from '~/types/app';
import type { DraggableItemData } from '~/types/common';

export type TaskDraggableItemData = DraggableItemData<Task> & { type: 'task' };
export type SubtaskDraggableItemData = DraggableItemData<Subtask> & { type: 'subtask' };

export const isTaskData = (data: Record<string | symbol, unknown>): data is TaskDraggableItemData => {
  return data.dragItem === true && typeof data.order === 'number' && data.type === 'task';
};
export const isSubtaskData = (data: Record<string | symbol, unknown>): data is SubtaskDraggableItemData => {
  return data.dragItem === true && typeof data.order === 'number' && data.type === 'subtask';
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
    side: 'right',
    className: 'max-w-full lg:max-w-4xl',
    id: isAdmin ? 'edit-project' : 'project-members',
    title: isAdmin ? t('common:resource_settings', { resource: t('app:project') }) : t('app:project_members'),
    description: isAdmin ? t('common:resource_settings.text', { resource: t('app:project').toLowerCase() }) : '',
  });
};
