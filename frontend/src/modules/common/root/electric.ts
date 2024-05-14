import { makeElectricContext } from 'electric-sql/react';
import type { Electric } from '~/generated/client';
import type { Projects as Project, Tasks as Task, Task_labels as TaskLabel, Labels as Label } from '~/generated/client';

export { schema } from '~/generated/client';
export type { Project, Task, Electric, Label };

export type ProjectWithLabels = Project & {
  labels?: Label[];
};

export type TaskWithTaskLabels = Task & {
  task_labels?: (TaskLabel & {
    labels?: Label[];
  })[];
};

export type TaskWithLabels = Task & {
  labels?: Label[];
};

export const { ElectricProvider, useElectric } = makeElectricContext<Electric>();
