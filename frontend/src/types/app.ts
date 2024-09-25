import type { labelSchema } from 'backend/modules/labels/schema';
import type { projectSchema } from 'backend/modules/projects/schema';
import type { fullTaskSchema, subTaskSchema } from 'backend/modules/tasks/schema';
import type { workspaceSchema } from 'backend/modules/workspaces/schema';

import type { TasksCustomEventMap } from '~/modules/tasks/types';

import type { z } from 'zod';

export type Workspace = z.infer<typeof workspaceSchema>;

export type Project = z.infer<typeof projectSchema>;
export type Task = z.infer<typeof fullTaskSchema>;
export type SubTask = z.infer<typeof subTaskSchema>[number];
export type Label = z.infer<typeof labelSchema>;

// biome-ignore lint/complexity/noBannedTypes: necessary to decouple app-specific types
export type AppCustomEventMap = TasksCustomEventMap;
