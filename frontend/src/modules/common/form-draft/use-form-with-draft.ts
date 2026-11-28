import { type BaseSyntheticEvent, useEffect, useEffectEvent, useRef, useState } from 'react';
import {
  type FieldPath,
  type FieldPathValue,
  type FieldValues,
  type SubmitErrorHandler,
  type UseFormProps,
  type UseFormReturn,
  useForm,
  useFormState,
} from 'react-hook-form';
import { useDraftStore } from '~/modules/common/form-draft/draft-store';
import { flushKvWrites } from '~/query/idb-kv-storage';
import { defaultOnInvalid } from '~/utils/form-on-invalid';
import { onPageHide } from '~/utils/on-page-hide';

/**
 * Hands `onValid` the validated values of the fields whose raw value differs from the default, beside the whole form: a
 * blank default the resolver turns into null is no change. An unmarked `setValue` goes out with the next marked edit.
 */
type HandleChanges<TFieldValues extends FieldValues> = (
  onValid: (changes: Partial<TFieldValues>, values: TFieldValues, event?: BaseSyntheticEvent) => unknown,
  onInvalid?: SubmitErrorHandler<TFieldValues>,
) => (event?: BaseSyntheticEvent) => Promise<void>;

/** The keys of `values` whose JSON differs from the default's; a missing default counts as `undefined`. */
const changedKeys = (values: FieldValues, defaults: FieldValues = {}) =>
  Object.keys(values).filter((key) => JSON.stringify(values[key]) !== JSON.stringify(defaults[key]));

/**
 * Form state that keeps a draft: restores it on mount and when one is written from outside while the form is clean, saves
 * edits 300 ms after the first unsaved one and at once when the form turns dirty, and flushes on unmount and tab-hide.
 * A create form submits through `handleSubmit`; an update form through `handleChanges`, which hands it the changed fields.
 */
// biome-ignore lint/suspicious/noExplicitAny: Can be any form context
export function useFormWithDraft<TFieldValues extends FieldValues = FieldValues, TContext = any>(
  formId: string,
  options?: {
    formOptions?: UseFormProps<TFieldValues, TContext>;
    /** The element that gets `.unsaved-changes`; default `formId`. */
    formContainerId?: string;
    /** Runs once a draft written from outside has loaded: an editor that reads its value only at creation remounts here. */
    onDraftLoad?: () => void;
  },
): UseFormReturn<TFieldValues, TContext, TFieldValues> & { isDirty: boolean; loading: boolean; handleChanges: HandleChanges<TFieldValues> } {
  const { formOptions, formContainerId, onDraftLoad } = options || {};

  const getDraftForm = useDraftStore((state) => state.getForm);
  const setDraftForm = useDraftStore((state) => state.setForm);
  const resetDraftForm = useDraftStore((state) => state.resetForm);

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

  // Save the edited values, or clear the draft when clean. It branches on the subscribed isDirty, never on
  // `form.formState.isDirty`: that lags the subscription both ways (false right after the first edit, true right after a reset).
  const saveDraft = useEffectEvent(() => {
    if (isDirty) {
      const values = form.getValues();
      const keys = changedKeys(values, form.formState.defaultValues).filter((key) => values[key] !== undefined);
      // A copy: the draft store freezes what it keeps, and a frozen array of the form's own refuses its next edit
      if (keys.length > 0) setDraftForm(formId, structuredClone(Object.fromEntries(keys.map((key) => [key, values[key]]))));
    } else {
      resetDraftForm(formId);
    }
    // Past the storage debounce: this hook holds edits for 300 ms already, and a write still waiting there is lost to a reload
    flushKvWrites();
  });

  // Subscribe directly to form changes so the delayed save does not rerender the form tree.
  useEffect(() => {
    const unsubscribe = form.subscribe({
      formState: { values: true },
      callback: () => {
        if (isResettingRef.current) return;

        // A stream of edits never postpones the save: it runs 300 ms after the first unsaved one.
        if (draftTimeoutRef.current !== undefined) return;
        draftTimeoutRef.current = setTimeout(() => {
          draftTimeoutRef.current = undefined;
          saveDraft();
        }, 300);
      },
    });

    // Saves the edits the armed timer holds; with none armed the store is already current.
    const flushPendingDraft = () => {
      if (draftTimeoutRef.current === undefined) return;
      clearTimeout(draftTimeoutRef.current);
      draftTimeoutRef.current = undefined;
      saveDraft();
    };

    // A hidden tab still commits the pending edits. A write issued while the page unloads never commits: a reload loses
    // at most the last 300 ms of edits.
    const stopHideFlush = onPageHide(flushPendingDraft);

    return () => {
      unsubscribe();
      stopHideFlush();
      flushPendingDraft();
    };
  }, [form]);

  useEffect(() => {
    toggleUnsavedBadge(isDirty);
    // At once, so the first edit survives a reload inside the 300 ms wait. Only when dirty: a clean mount must not clear the
    // stored draft before the restore below reads it.
    if (isDirty) saveDraft();
  }, [isDirty]);

  const loadDraft = (draftData: Record<string, unknown>) => {
    // The store keeps drafts untyped; their values were taken from this form's fields.
    for (const [key, value] of Object.entries(draftData))
      form.setValue(key as FieldPath<TFieldValues>, value as FieldPathValue<TFieldValues, FieldPath<TFieldValues>>, { shouldDirty: true });
  };

  useEffect(() => {
    const draftData = getDraftForm(formId);
    if (draftData) loadDraft(draftData);
    setLoading(false);
  }, []);

  // A draft that arrives while the form is clean came from outside: this hook writes one only while dirty.
  const loadLateDraft = useEffectEvent((draftData: Record<string, unknown>) => {
    if (isDirty) return;
    loadDraft(draftData);
    onDraftLoad?.();
  });

  useEffect(
    () =>
      useDraftStore.subscribe((state, prev) => {
        const draftData = state.forms[formId];
        if (draftData && draftData !== prev.forms[formId]) loadLateDraft(draftData);
      }),
    [formId],
  );

  return {
    ...form,
    isDirty,
    loading,
    handleSubmit: (onValid, onInvalid = defaultOnInvalid) => form.handleSubmit(onValid, onInvalid),
    handleChanges: (onValid, onInvalid = defaultOnInvalid) =>
      form.handleSubmit(async (values, event) => {
        const changes: Partial<TFieldValues> = {};
        for (const key of changedKeys(form.getValues(), form.formState.defaultValues)) {
          if (key in values) Object.assign(changes, { [key]: values[key] });
        }
        await onValid(changes, values, event);
      }, onInvalid),
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
