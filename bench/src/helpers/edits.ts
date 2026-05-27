/**
 * Edit payload builders for task mutation scenarios.
 *
 * Shared between task-edit and attachment-edit scenarios.
 */
import { nanoid } from 'nanoid';
import { uuidv7 } from 'uuidv7';
import { userId } from '../config';

export interface StxPayload {
  mutationId: string;
  sourceId: string;
  fieldTimestamps: Record<string, string>;
}

export interface EditPayload {
  ops: Record<string, unknown>;
  stx: StxPayload;
}

type EditBuilder = () => EditPayload;

function hashSourceId(sourceId: string): string {
  let hash = 0;
  for (let i = 0; i < sourceId.length; i++) {
    hash = ((hash << 5) - hash + sourceId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36).padStart(5, '0').slice(0, 5);
}

function hlcTimestamp(sourceId: string, counter = 0): string {
  const now = Date.now();
  return `${now}:${String(counter).padStart(4, '0')}:${hashSourceId(sourceId)}`;
}

function buildStx(fieldNames: string[]): StxPayload {
  const sourceId = uuidv7();
  const fieldTimestamps: Record<string, string> = {};
  for (let i = 0; i < fieldNames.length; i++) {
    fieldTimestamps[fieldNames[i]] = hlcTimestamp(sourceId, i);
  }
  return { mutationId: uuidv7(), sourceId, fieldTimestamps };
}

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildAssignedToEdit(): EditPayload {
  const count = Math.floor(Math.random() * 3) + 1;
  const assignees: string[] = [];
  for (let i = 0; i < count; i++) {
    assignees.push(userId(Math.floor(Math.random() * 100)));
  }
  return {
    ops: { assignedTo: { add: assignees, remove: [] } },
    stx: buildStx(['assignedTo']),
  };
}

function buildVariantEdit(): EditPayload {
  return {
    ops: { variant: randomChoice([1, 2, 3]) },
    stx: buildStx(['variant']),
  };
}

function buildStatusEdit(): EditPayload {
  return {
    ops: { status: randomChoice([0, 1, 2, 3, 4, 5, 6]) },
    stx: buildStx(['status']),
  };
}

function buildDescriptionEdit(): EditPayload {
  const descriptions = [
    '[{"type":"paragraph","content":[{"type":"text","text":"Updated task with new requirements from the product team."}]}]',
    '[{"type":"paragraph","content":[{"type":"text","text":"This task has been reprioritized due to customer feedback."}]}]',
    '[{"type":"paragraph","content":[{"type":"text","text":"Implementation notes: check API response format, update unit tests, deploy to staging."}]}]',
    '[{"type":"paragraph","content":[{"type":"text","text":"Bug report: users experiencing slow load times on the dashboard."}]}]',
    '[{"type":"paragraph","content":[{"type":"text","text":"Feature spec v2: add support for bulk operations on task lists."}]}]',
  ];
  return {
    ops: { description: randomChoice(descriptions) },
    stx: buildStx(['description']),
  };
}

/** All edit types including description. */
export const allEditBuilders: EditBuilder[] = [
  buildAssignedToEdit,
  buildVariantEdit,
  buildStatusEdit,
  buildDescriptionEdit,
];
