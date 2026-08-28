import { useEffect, useRef, useState } from 'react';
import type { FieldPath, FieldValues, UseFormProps, UseFormReturn } from 'react-hook-form';
import { useForm, useFormState } from 'react-hook-form';
import { useDraftStore } from '~/modules/common/form-draft/draft-store';
import { flushKvWrites } from '~/query/idb-kv-storage';
import { defaultOnInvalid } from '~/utils/form-on-invalid';

/**
 * Form state with draft-saving: restores saved drafts on mount, tracks unsaved changes. Drafts persist via a
 * debounced `form.watch` subscription, immediately when a form first turns dirty, and flush on unmount and
 * tab-hide to prevent data loss. `formContainerId` names the element whose `.unsaved-changes` class is toggled.
 */
// biome-ignore lint/suspicious/noExplicitAny: Can be any form context
export function useFormWithDraft<TFieldValues extends FieldValues = FieldValues, TContext = any>(
  formId: string,
  opt?: {
    formOptions?: UseFormProps<TFieldValues, TContext>;
    formContainerId?: string;
  },
): UseFormReturn<TFieldValues, TContext, TFieldValues> & {
  unsavedChanges: boolean;
  isDirty: boolean;
  loading: boolean;
} {
  const { formOptions, formContainerId } = opt || {};

  const getDraftForm = useDraftStore((state) => state.getForm);
  const setDraftForm = useDraftStore((state) => state.setForm);
  const resetDraftForm = useDraftStore((state) => state.resetForm);
  const setFormDirty = useDraftStore((state) => state.setFormDirty);

  const form = useForm<TFieldValues, TContext, TFieldValues>(formOptions);

  const [loading, setLoading] = useState(true);
  const isResetting = useRef(false);
  const draftTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Only subscribes to isDirty, a binary state change with minimal re-renders.
  const { isDirty } = useFormState({ control: form.control });

  // Keep formId fresh for use in subscription callbacks
  const formIdRef = useRef(formId);
  formIdRef.current = formId;

  // The subscribed isDirty, readable from timers and cleanups: `form.formState.isDirty` is a proxy
  // read that lags the subscription in both directions (still false right after the first edit,
  // still true right after a reset), so callbacks must never branch on it directly.
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  const toggleUnsavedBadge = (show: boolean) => {
    const el = document.getElementById(formContainerId || formId);
    if (!el) return;
    el.classList.toggle('unsaved-changes', show);
  };

  /** Save the current values (or clear the draft when clean). Reads only refs and stable store actions. */
  const saveDraft = () => {
    const id = formIdRef.current;
    if (isDirtyRef.current) {
      const values = form.getValues();
      const cleaned = Object.fromEntries(Object.entries(values).filter(([_, v]) => v !== undefined));
      if (Object.keys(cleaned).length > 0) setDraftForm(id, cleaned);
    } else {
      resetDraftForm(id);
    }
  };

  // Subscribe directly to form changes so debounced persistence does not rerender the form tree.
  useEffect(() => {
    const subscription = form.watch(() => {
      if (isResetting.current) return;

      clearTimeout(draftTimeoutRef.current);
      draftTimeoutRef.current = setTimeout(() => {
        draftTimeoutRef.current = undefined;
        saveDraft();
      }, 300);
    });

    // Flush an armed debounce, i.e. edits from the last few hundred ms. With no timer armed the
    // store is already current: the debounce fired, or a reset deliberately cleared the draft
    // (`formState.isDirty` reads stale-true inside cleanup, so it cannot gate this flush).
    const flushPendingDraft = () => {
      if (draftTimeoutRef.current === undefined) return;
      clearTimeout(draftTimeoutRef.current);
      draftTimeoutRef.current = undefined;
      saveDraft();
    };

    // Best-effort flush when the tab is hidden: covers backgrounding (the put commits while the page
    // lives on). It can NOT cover reload/close, since IndexedDB writes issued during unload never
    // commit; the dirty-flag effect below therefore also writes the values the moment a form turns dirty.
    // flushKvWrites, because the storage layer's own hide flush has already run by the time this
    // later-registered listener appends its write.
    const flushOnHide = () => {
      if (draftTimeoutRef.current === undefined) return;
      flushPendingDraft();
      flushKvWrites();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushOnHide();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', flushOnHide);

    return () => {
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', flushOnHide);
      // Flush draft on cleanup (unmount or dep change) to prevent data loss
      flushPendingDraft();
    };
  }, [form, setDraftForm, resetDraftForm]);

  useEffect(() => {
    toggleUnsavedBadge(isDirty);
    // Values first, flag second, into the one persisted blob: the flag must never land in storage
    // without content behind it. A reload cannot flush anything (unload-time IndexedDB writes are
    // discarded), so this immediate save is what keeps a draft badge truthful after one. Only on
    // dirty: the clean branch must not clear a stored draft before the mount restore below reads it.
    if (isDirty) saveDraft();
    setFormDirty(formId, isDirty);
  }, [isDirty]);

  useEffect(() => {
    const draftData = getDraftForm<TFieldValues>(formId);

    if (draftData) {
      for (const [key, value] of Object.entries(draftData))
        form.setValue(key as FieldPath<TFieldValues>, value, { shouldDirty: true });
    }

    setLoading(false);
  }, []);

  return {
    ...form,
    unsavedChanges: isDirty,
    isDirty,
    loading,
    // Always route `onInvalid` through a fallback handler
    handleSubmit: (onValid, onInvalid = defaultOnInvalid) => form.handleSubmit(onValid, onInvalid),
    // Reset also clears the draft and the badge
    reset: (values, keepStateOptions) => {
      isResetting.current = true;
      clearTimeout(draftTimeoutRef.current);
      draftTimeoutRef.current = undefined;
      resetDraftForm(formId);
      setFormDirty(formId, false);
      toggleUnsavedBadge(false);
      form.reset(values, keepStateOptions);
      // reset() has notified its watchers synchronously; re-arm so later edits persist again.
      isResetting.current = false;
    },
  };
}
