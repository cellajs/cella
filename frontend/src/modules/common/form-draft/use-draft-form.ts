import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { FieldPath, FieldValues, UseFormProps, UseFormReturn } from 'react-hook-form';
import { useForm, useFormState } from 'react-hook-form';
import { useDraftStore } from '~/modules/common/form-draft/draft-store';
import { flushKvWrites } from '~/query/idb-kv-storage';
import { defaultOnInvalid } from '~/utils/form-on-invalid';
import { onPageHide } from '~/utils/on-page-hide';

/**
 * Form state that keeps a draft: restores it on mount, saves edits debounced and at once when the form turns dirty, and
 * flushes on unmount and tab-hide. `formContainerId` (default: `formId`) names the element that gets `.unsaved-changes`.
 */
// biome-ignore lint/suspicious/noExplicitAny: Can be any form context
export function useFormWithDraft<TFieldValues extends FieldValues = FieldValues, TContext = any>(
  formId: string,
  options?: { formOptions?: UseFormProps<TFieldValues, TContext>; formContainerId?: string },
): UseFormReturn<TFieldValues, TContext, TFieldValues> & { isDirty: boolean; loading: boolean } {
  const { formOptions, formContainerId } = options || {};

  const getDraftForm = useDraftStore((state) => state.getForm);
  const setDraftForm = useDraftStore((state) => state.setForm);
  const resetDraftForm = useDraftStore((state) => state.resetForm);
  const setFormDirty = useDraftStore((state) => state.setFormDirty);

  const form = useForm<TFieldValues, TContext, TFieldValues>(formOptions);

  const [loading, setLoading] = useState(true);
  const isResettingRef = useRef(false);
  const draftTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Only subscribes to isDirty, a binary state change with minimal re-renders.
  const { isDirty } = useFormState({ control: form.control });

  const toggleUnsavedBadge = (show: boolean) => {
    const container = document.getElementById(formContainerId || formId);
    if (!container) return;
    container.classList.toggle('unsaved-changes', show);
  };

  // Save the current values, or clear the draft when clean. It branches on the subscribed isDirty, never on
  // `form.formState.isDirty`: that lags the subscription both ways (false right after the first edit, true right after a reset).
  const saveDraft = useEffectEvent(() => {
    if (isDirty) {
      const values = form.getValues();
      const cleaned = Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
      if (Object.keys(cleaned).length > 0) setDraftForm(formId, cleaned);
    } else {
      resetDraftForm(formId);
    }
    // Past the storage debounce: this hook debounces edits already, and a write still waiting there is lost to a reload
    flushKvWrites();
  });

  // Subscribe directly to form changes so debounced persistence does not rerender the form tree.
  useEffect(() => {
    const unsubscribe = form.subscribe({
      formState: { values: true },
      callback: () => {
        if (isResettingRef.current) return;

        clearTimeout(draftTimeoutRef.current);
        draftTimeoutRef.current = setTimeout(() => {
          draftTimeoutRef.current = undefined;
          saveDraft();
        }, 300);
      },
    });

    // Saves the edits a pending debounce holds; with no timer armed the store is already current.
    const flushPendingDraft = () => {
      if (draftTimeoutRef.current === undefined) return;
      clearTimeout(draftTimeoutRef.current);
      draftTimeoutRef.current = undefined;
      saveDraft();
    };

    // A hidden tab still commits the pending edits. A write issued while the page unloads never commits, so a reload
    // loses the edits made since the last 300 ms pause.
    const stopHideFlush = onPageHide(flushPendingDraft);

    return () => {
      unsubscribe();
      stopHideFlush();
      flushPendingDraft();
    };
  }, [form]);

  useEffect(() => {
    toggleUnsavedBadge(isDirty);
    // Values before the flag, at once, so a draft badge after a reload always has a draft behind it. Only when dirty:
    // a clean mount must not clear the stored draft before the restore below reads it.
    if (isDirty) saveDraft();
    setFormDirty(formId, isDirty);
  }, [isDirty]);

  useEffect(() => {
    const draftData = getDraftForm<TFieldValues>(formId);

    if (draftData) {
      for (const [key, value] of Object.entries(draftData)) form.setValue(key as FieldPath<TFieldValues>, value, { shouldDirty: true });
    }

    setLoading(false);
  }, []);

  return {
    ...form,
    isDirty,
    loading,
    handleSubmit: (onValid, onInvalid = defaultOnInvalid) => form.handleSubmit(onValid, onInvalid),
    // Reset also clears the draft and the badge
    reset: (values, keepStateOptions) => {
      isResettingRef.current = true;
      clearTimeout(draftTimeoutRef.current);
      draftTimeoutRef.current = undefined;
      resetDraftForm(formId);
      flushKvWrites();
      toggleUnsavedBadge(false);
      form.reset(values, keepStateOptions);
      // reset() has notified its watchers synchronously; re-arm so later edits persist again.
      isResettingRef.current = false;
    },
  };
}
