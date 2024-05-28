import { makeElectricContext } from 'electric-sql/react';
import type { Electric } from '~/generated/client';
import type { Labels as Label, Tasks as BaseTask } from '~/generated/client';

export { schema } from '~/generated/client';
export type { Electric, Label };

export type Task = Omit<BaseTask, 'labels' | 'assignedTo'> & {
  labels: string[] | null;
  assignedTo: string[] | null;
};

export type TaskWithLabels = Omit<Task, 'labels'> & {
  labels: Label[];
};

export const { ElectricProvider, useElectric } = makeElectricContext<Electric>();
