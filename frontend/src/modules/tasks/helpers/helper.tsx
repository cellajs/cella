import type { NavigateFn } from '@tanstack/react-router';
import { t } from 'i18next';
import { Suspense, lazy } from 'react';
import { sheet } from '~/modules/common/sheeter/state';
import type { Mode } from '~/store/theme';
import type { Task } from '~/types/app';
import { objectKeys } from '~/utils/object';

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
      <TaskCard mode={mode} task={task} state={'editing'} isSelected={false} isFocused={true} isSheet />
    </Suspense>,
    {
      className: 'max-w-full lg:max-w-4xl px-0',
      title: <span className="px-4">{t('app:task')}</span>,
      id: `task-preview-${task.id}`,
      removeCallback: () => {
        navigate({
          to: '.',
          replace: true,
          resetScroll: false,
          search: (prev) => {
            const newSearch = { ...prev };
            for (const key of objectKeys(newSearch)) {
              if (key.includes('Preview')) delete newSearch[key];
            }
            return newSearch;
          },
        });
        sheet.remove(`task-preview-${task.id}`);
      },
    },
  );
};
