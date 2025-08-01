import type * as LabelPrimitive from '@radix-ui/react-label';
import { Slot } from '@radix-ui/react-slot';
import { ChevronUp, HelpCircle } from 'lucide-react';
import * as React from 'react';
import { useState } from 'react';
import {
  Controller,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
  FormProvider,
  type FormProviderProps,
  useFormContext,
  useFormState,
} from 'react-hook-form';
import { Button } from '~/modules/ui/button';
import { Label } from '~/modules/ui/label';
import { cn } from '~/utils/cn';
import { getNestedValue } from '~/utils/get-nested-value';

export type LabelDirectionType = 'top' | 'left';
const LabelDirectionContext = React.createContext<LabelDirectionType | string>('top');

// biome-ignore lint/suspicious/noExplicitAny: unable to infer type due to dynamic data structure
type FormProps<TFieldValues extends FieldValues, TContext = any, TTransformedValues extends FieldValues = TFieldValues> = FormProviderProps<
  TFieldValues,
  TContext,
  TTransformedValues
> & {
  unsavedChanges?: boolean;
  labelDirection?: string;
};

// biome-ignore lint/suspicious/noExplicitAny: any is required here
const Form = <TFieldValues extends FieldValues, TContext = any, TTransformedValues extends FieldValues = TFieldValues>({
  children,
  unsavedChanges,
  labelDirection = 'top',
  ...props
}: FormProps<TFieldValues, TContext, TTransformedValues> & {
  unsavedChanges?: boolean;
}) => {
  return (
    <FormProvider {...props}>
      <LabelDirectionContext.Provider value={labelDirection}>{children}</LabelDirectionContext.Provider>
    </FormProvider>
  );
};

type FormFieldContextValue<TFieldValues extends FieldValues = FieldValues, TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>> = {
  name: TName;
};

const FormFieldContext = React.createContext<FormFieldContextValue>({} as FormFieldContextValue);

const FormField = <TFieldValues extends FieldValues = FieldValues, TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>>({
  ...props
}: ControllerProps<TFieldValues, TName>) => {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
};

const useFormField = () => {
  const fieldContext = React.useContext(FormFieldContext);
  const itemContext = React.useContext(FormItemContext);

  const { control } = useFormContext();

  if (!fieldContext) {
    throw new Error('useFormField should be used within <FormField>');
  }

  const { name } = fieldContext;

  const { errors, touchedFields, dirtyFields } = useFormState({ control, name });
  const error = getNestedValue(errors, name);
  const isTouched = !!getNestedValue(touchedFields, name);
  const isDirty = !!getNestedValue(dirtyFields, name);
  const invalid = !!error;

  const { id } = itemContext;
  const formItemId = `${id}-form-item`;

  return {
    id,
    name,
    formItemId,
    formDescriptionId: `${formItemId}-text`,
    formMessageId: `${formItemId}-message`,
    error,
    isTouched,
    isDirty,
    invalid,
  };
};

type FormItemContextValue = {
  id: string;
};

const FormItemContext = React.createContext<FormItemContextValue>({} as FormItemContextValue);

// INFO: added to support targeting the entire form item (for example to hide)
type FormItemProps = React.HTMLAttributes<HTMLDivElement> & {
  name?: string;
};

const FormItem = React.forwardRef<HTMLDivElement, FormItemProps>(({ className, name, ...props }, ref) => {
  const id = React.useId();
  const labelDirection = React.useContext(LabelDirectionContext);

  return (
    <FormItemContext.Provider value={{ id }}>
      <div
        ref={ref}
        id={`${(name || id).toLowerCase()}-form-item-container`}
        className={cn(`${labelDirection === 'top' ? 'flex-col' : 'flex-row items-center'} flex gap-2`, className)}
        {...props}
      />
    </FormItemContext.Provider>
  );
});
FormItem.displayName = 'FormItem';

const FormLabel = React.forwardRef<React.ComponentRef<typeof LabelPrimitive.Root>, React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>>(
  ({ className, ...props }, ref) => {
    const { formItemId } = useFormField();

    return <Label ref={ref} className={cn('', className)} htmlFor={formItemId} {...props} />;
  },
);
FormLabel.displayName = 'FormLabel';

const FormControl = React.forwardRef<React.ComponentRef<typeof Slot>, React.ComponentPropsWithoutRef<typeof Slot>>(({ ...props }, ref) => {
  const { error, formItemId, formDescriptionId, formMessageId } = useFormField();

  return (
    <Slot
      ref={ref}
      id={formItemId}
      aria-describedby={!error ? `${formDescriptionId}` : `${formDescriptionId} ${formMessageId}`}
      aria-invalid={!!error}
      {...props}
    />
  );
});
FormControl.displayName = 'FormControl';

const FormDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ children, className, ...props }, ref) => {
    const { formDescriptionId } = useFormField();
    const [collapsed, setCollapsed] = useState(true);

    const toggleCollapsed = (e: { preventDefault: () => void }) => {
      setCollapsed(!collapsed);
      e.preventDefault();
    };

    // EDIT: This is customized to allow for collapsible descriptions
    return (
      <div ref={ref} id={formDescriptionId} className={cn('text-muted-foreground font-light relative -mt-2! text-sm', className)} {...props}>
        <div className="flex justify-between">
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={toggleCollapsed}
            className="right-1 -top-6 absolute text-regular ring-inset opacity-50 hover:opacity-100 p-2 h-auto"
          >
            {collapsed && <HelpCircle size={16} />}
            {!collapsed && <ChevronUp size={16} />}
          </Button>
          {!collapsed && <span className="py-1">{children}</span>}
        </div>
      </div>
    );
  },
);
FormDescription.displayName = 'FormDescription';

const FormMessage = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(({ className, children, ...props }, ref) => {
  const { error, formMessageId } = useFormField();
  const body = error ? String(Array.isArray(error) ? error.find((err) => err?.message)?.message : error?.message) : children;

  if (!body) {
    return null;
  }

  return (
    <p ref={ref} id={formMessageId} className={cn('text-destructive text-sm', className)} {...props}>
      {body}
    </p>
  );
});
FormMessage.displayName = 'FormMessage';

export { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, useFormField };
