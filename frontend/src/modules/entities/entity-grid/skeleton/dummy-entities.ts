import type { ContextEntityType } from 'config';
import { nanoid } from '~/utils/nanoid';

export const getDummyEntities = (entityType: ContextEntityType, number = 10) =>
  Array.from({ length: number }).map((_, i) => ({
    id: nanoid(),
    name: `${entityType} ${i}`,
    members: Array.from({ length: Math.floor(Math.random() * 5) + 1 }).map((_, j) => ({
      id: nanoid(),
      name: `Member ${j}`,
    })),
  }));
