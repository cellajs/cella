import { makeElectricContext } from 'electric-sql/react';
import type { Electric } from '~/generated/client';
import type { Projects as Project } from '~/generated/client';
import type { Tasks as Task } from '~/generated/client';
import type { Labels as Label } from '~/generated/client';

export { schema } from '~/generated/client';
export type { Project, Task, Electric, Label };

export type ProjectWithLabels = Project & {
  labels?: Label[];
};

export type TaskWithLabels = Task & {
  task_labels?: Label[];
};

export const { ElectricProvider, useElectric } = makeElectricContext<Electric>();
