import type { ProductEntityType } from 'shared';
import { create } from 'zustand';

/** Runtime registry of fields owned by Yjs during collaborative editing — SSE updates skip these */
const yjsOwnedFields = new Map<ProductEntityType, string[]>();

/** Register Yjs-owned fields for an entity type. Call at module load time (e.g., in the entity's query.ts). */
export function registerYjsOwnedFields(entityType: ProductEntityType, fields: string[]): void {
  yjsOwnedFields.set(entityType, fields);
}

interface YjsEditorState {
  /** Map of entityType → Set of entityIds with active Yjs editors */
  active: Map<ProductEntityType, Set<string>>;
  register: (entityType: ProductEntityType, entityId: string) => void;
  unregister: (entityType: ProductEntityType, entityId: string) => void;
  isActive: (entityType: ProductEntityType, entityId: string) => boolean;
  getOwnedFields: (entityType: ProductEntityType) => string[];
}

/**
 * Tracks which entities have active Yjs editors.
 * Used by SSE cache ops to suppress description-derived field updates
 * while the local editor has a more recent Y.Doc state.
 */
export const useYjsEditorStore = create<YjsEditorState>((set, get) => ({
  active: new Map(),

  register: (entityType, entityId) =>
    set((state) => {
      const next = new Map(state.active);
      const ids = new Set(next.get(entityType));
      ids.add(entityId);
      next.set(entityType, ids);
      return { active: next };
    }),

  unregister: (entityType, entityId) =>
    set((state) => {
      const next = new Map(state.active);
      const ids = new Set(next.get(entityType));
      ids.delete(entityId);
      if (ids.size === 0) next.delete(entityType);
      else next.set(entityType, ids);
      return { active: next };
    }),

  isActive: (entityType, entityId) => {
    return get().active.get(entityType)?.has(entityId) ?? false;
  },

  getOwnedFields: (entityType) => {
    return yjsOwnedFields.get(entityType) ?? ['description'];
  },
}));
