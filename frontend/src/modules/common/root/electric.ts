import { makeElectricContext } from 'electric-sql/react';
import type { Electric } from '~/generated/client';
import type { Labels as Label, Tasks as Task, Task_labels as TaskLabel } from '~/generated/client';

export { schema } from '~/generated/client';
export type { Task, Electric, Label };

export type TaskWithTaskLabels = Task & {
  task_labels?: (TaskLabel & {
    labels?: Label[];
  })[];
};

export type TaskWithLabels = Task & {
  labels?: Label[];
};

export const { ElectricProvider, useElectric } = makeElectricContext<Electric>();
