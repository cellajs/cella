import { makeElectricContext } from 'electric-sql/react';
import type { Electric } from '~/generated/client';
import type { Tasks as BaseTask, Labels as Label } from '~/generated/client';
import type { Member } from '~/types';

export { schema } from '~/generated/client';
export type { Electric, Label };

export type Task = Omit<BaseTask, 'labels' | 'assigned_to'> & {
  labels: string[] | null;
  virtualLabels: Label[];
  assigned_to: string[] | null;
  virtualAssignedTo: Member[];
  virtualCreatedBy?: Member;
  virtualUpdatedBy?: Member;
  subTasks: Task[];
};

export const { ElectricProvider, useElectric } = makeElectricContext<Electric>();
