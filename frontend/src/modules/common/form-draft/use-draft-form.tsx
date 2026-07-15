import { useEffect, useRef, useState } from 'react';
import {
  type FieldPath,
  type FieldValues,
  type UseFormProps,
  type UseFormReturn,
  useForm,
  useFormState,
} from 'react-hook-form';
import { useDraftStore } from '~/modules/common/form-draft/draft-store';
import { defaultOnInvalid } from '~/utils/form-on-invalid';

/**
 * Form state with draft-saving: restores saved drafts on mount, tracks unsaved changes. Drafts persist via a
 * debounced `form.watch` subscription (not per keystroke) and flush on unmount to prevent data loss.
 * `formContainerId` names the element whose `.unsaved-changes` class is toggled.
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

  // Draft store hooks
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

  // Add or remove `.unsaved-changes` class on container
  const toggleUnsavedBadge = (show: boolean) => {
    const el = document.getElementById(formContainerId || formId);
    if (!el) return;
    el.classList.toggle('unsaved-changes', show);
  };

  // Debounced draft persistence via form.watch subscription.
  // Unlike useWatch, form.watch(callback) does NOT trigger React re-renders:
  // it invokes the callback directly, letting us debounce the save without
  // cascading re-renders through the form component tree.
  useEffect(() => {
    const subscription = form.watch(() => {
      if (isResetting.current) return;

      clearTimeout(draftTimeoutRef.current);
      draftTimeoutRef.current = setTimeout(() => {
        const id = formIdRef.current;
        if (form.formState.isDirty) {
          const values = form.getValues();
          const cleaned = Object.fromEntries(Object.entries(values).filter(([_, v]) => v !== undefined));
          if (Object.keys(cleaned).length > 0) setDraftForm(id, cleaned);
        } else {
          // User reverted to defaults, so clear saved draft.
          resetDraftForm(id);
        }
      }, 1000);
    });

    return () => {
      subscription.unsubscribe();
      clearTimeout(draftTimeoutRef.current);
      // Flush draft on cleanup (unmount or dep change) to prevent data loss
      if (form.formState.isDirty) {
        const values = form.getValues();
        const cleaned = Object.fromEntries(Object.entries(values).filter(([_, v]) => v !== undefined));
        if (Object.keys(cleaned).length > 0) setDraftForm(formIdRef.current, cleaned);
      }
    };
  }, [form, setDraftForm, resetDraftForm]);

  // Sync dirty state to UI badge and store (only fires on isDirty toggle)
  useEffect(() => {
    toggleUnsavedBadge(isDirty);
    setFormDirty(formId, isDirty);
  }, [isDirty]);

  // Restore draft on mount
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
    // Override `handleSubmit` to always process `onInvalid` through a fallback handler
    handleSubmit: (onValid, onInvalid = defaultOnInvalid) => form.handleSubmit(onValid, onInvalid),
    // Override `reset` to also clear the draft + UI state
    reset: (values, keepStateOptions) => {
      isResetting.current = true;
      clearTimeout(draftTimeoutRef.current);
      resetDraftForm(formId);
      setFormDirty(formId, false);
      toggleUnsavedBadge(false);
      form.reset(values, keepStateOptions);
    },
  };
}
