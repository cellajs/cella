import type { labelSchema } from 'backend/modules/labels/schema';
import type { projectSchema } from 'backend/modules/projects/schema';
import type { subtaskSchema, taskWithSubtasksSchema } from 'backend/modules/tasks/schema';
import type { workspaceSchema } from 'backend/modules/workspaces/schema';

import type { TasksCustomEventMap } from '~/modules/tasks/types';

import type { z } from 'zod';

// Entities
export type Workspace = z.infer<typeof workspaceSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Task = z.infer<typeof taskWithSubtasksSchema>;
export type Subtask = z.infer<typeof subtaskSchema>[number];
export type Label = z.infer<typeof labelSchema>;

// Custom Event Map
export type AppCustomEventMap = TasksCustomEventMap;

// Draggable Item Type
export type DraggableItemType = 'menuItem' | 'task' | 'subtask';
