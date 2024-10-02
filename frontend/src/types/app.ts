import type { labelSchema } from 'backend/modules/labels/schema';
import type { projectSchema } from 'backend/modules/projects/schema';
import type { subTaskSchema, taskWithSubTasksSchema } from 'backend/modules/tasks/schema';
import type { workspaceSchema } from 'backend/modules/workspaces/schema';

import type { TasksCustomEventMap } from '~/modules/tasks/types';

import type { z } from 'zod';

export type Workspace = z.infer<typeof workspaceSchema>;

export type Project = z.infer<typeof projectSchema>;
export type Task = z.infer<typeof taskWithSubTasksSchema>;
export type SubTask = z.infer<typeof subTaskSchema>[number];
export type Label = z.infer<typeof labelSchema>;

export type AppCustomEventMap = TasksCustomEventMap;

export type DraggableItemType = 'menuItem' | 'task' | 'subTask';
