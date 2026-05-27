import { useEffect, useRef } from 'react';
import type { ProductEntityType } from 'shared';
import type { CustomBlock, CustomBlockNoteEditor } from '~/modules/common/blocknote/types';
import { useYjsEditorStore } from '~/modules/common/blocknote/yjs-editor';

const DERIVED_DEBOUNCE_MS = 1_000;

interface UseDerivedFieldsSenderOptions {
  entityId: string;
  entityType: ProductEntityType;
  editor: CustomBlockNoteEditor;
  /** Callback that sends the description update through a React Query mutation. */
  sendUpdate: (entityId: string, description: string) => Promise<void>;
}

/**
 * Debounced description sender for collaborative editing.
 * Watches editor content changes and calls the provided `sendUpdate` callback,
 * which should trigger the entity's React Query mutation (e.g. useTaskUpdateMutation).
 * Going through the mutation ensures lifecycle hooks (onMutate, onSuccess) fire,
 * keeping the query cache in sync with server-computed derived fields.
 *
 * Pass `null` to disable (when not in collaborative mode).
 * Flushes immediately on unmount to ensure no data loss.
 */
export function useDerivedFieldsSender(options: UseDerivedFieldsSenderOptions | null) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastSentRef = useRef<string>('');

  // Keep refs fresh for the flush function
  const optionsRef = useRef(options);
  optionsRef.current = options;

  /** Snapshot current editor content as "already sent" to prevent a spurious PUT.
   *  Call this after seeding the editor with existing server content. */
  const markContentAsSent = () => {
    const opts = optionsRef.current;
    if (!opts) return;
    const blocks = opts.editor.document as unknown as CustomBlock[];
    lastSentRef.current = JSON.stringify(blocks);
  };

  const sendDescription = async () => {
    const opts = optionsRef.current;
    if (!opts) return;

    const blocks = opts.editor.document as unknown as CustomBlock[];
    const description = JSON.stringify(blocks);

    // Skip if content hasn't changed since last send
    if (description === lastSentRef.current) return;
    lastSentRef.current = description;

    try {
      await opts.sendUpdate(opts.entityId, description);
    } catch (err) {
      console.error('[useDerivedFieldsSender] Failed to send description update', err);
    }
  };

  useEffect(() => {
    if (!options) return;

    // Register for SSE suppression while the editor is active
    useYjsEditorStore.getState().register(options.entityType, options.entityId);

    const onChange = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        sendDescription();
        timerRef.current = undefined;
      }, DERIVED_DEBOUNCE_MS);
    };

    const unsubscribe = options.editor.onChange(onChange);
    const { entityType, entityId } = options;

    return () => {
      unsubscribe();
      // Flush pending changes, then lift SSE suppression once the server has the data.
      // This prevents SSE from overwriting the cache with stale server data between
      // unmount and mutation completion.
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = undefined;
        sendDescription().finally(() => {
          useYjsEditorStore.getState().unregister(entityType, entityId);
        });
      } else {
        useYjsEditorStore.getState().unregister(entityType, entityId);
      }
    };
  }, [options?.editor]);

  // Safety net for tab close
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        sendDescription();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  return { markContentAsSent };
}
