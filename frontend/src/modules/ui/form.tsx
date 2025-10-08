import type * as LabelPrimitive from '@radix-ui/react-label';
import { Slot } from '@radix-ui/react-slot';
import { ChevronUp, HelpCircle } from 'lucide-react';
import * as React from 'react';
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

// === Label direction context ===
export type LabelDirectionType = 'top' | 'left';
const LabelDirectionContext = React.createContext<LabelDirectionType>('top');

// === Form props with generics ===
type FormProps<TFieldValues extends FieldValues, TContext = unknown, TTransformedValues extends FieldValues = TFieldValues> = FormProviderProps<
  TFieldValues,
  TContext,
  TTransformedValues
> & {
  unsavedChanges?: boolean;
  labelDirection?: LabelDirectionType;
};

const Form = <TFieldValues extends FieldValues, TContext = unknown, TTransformedValues extends FieldValues = TFieldValues>({
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

  const { getFieldState } = useFormContext();
  const formState = useFormState({ name: fieldContext.name });
  const fieldState = getFieldState(fieldContext.name, formState);

  if (!fieldContext) {
    throw new Error('useFormField should be used within <FormField>');
  }

  const { id } = itemContext;
  const { name } = fieldContext;
  const formItemId = `${id}-form-item`;

  return {
    id,
    name,
    formItemId,
    formDescriptionId: `${formItemId}-text`,
    formMessageId: `${formItemId}-message`,
    ...fieldState,
  };
};

type FormItemContextValue = { id: string };

const FormItemContext = React.createContext<FormItemContextValue>({} as FormItemContextValue);

// INFO: added to support targeting the entire form item (for example to hide)
function FormItem({ className, name, ...props }: React.ComponentProps<'div'> & { name?: string }) {
  const id = React.useId();
  const labelDirection = React.useContext(LabelDirectionContext);

  return (
    <FormItemContext.Provider value={{ id }}>
      <div
        data-slot="form-item"
        id={`${(name || id).toLowerCase()}-form-item-container`}
        className={cn(`${labelDirection === 'top' ? 'flex-col' : 'flex-row items-center'} flex gap-2`, className)}
        {...props}
      />
    </FormItemContext.Provider>
  );
}

function FormLabel({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  const { error, formItemId } = useFormField();
  return <Label data-slot="form-label" data-error={!!error} className={cn('', className)} htmlFor={formItemId} {...props} />;
}

function FormControl({ ...props }: React.ComponentProps<typeof Slot>) {
  const { error, formItemId, formDescriptionId, formMessageId } = useFormField();
  return (
    <Slot
      data-slot="form-control"
      id={formItemId}
      aria-describedby={!error ? `${formDescriptionId}` : `${formDescriptionId} ${formMessageId}`}
      aria-invalid={!!error}
      {...props}
    />
  );
}

function FormDescription({ className, children, ...props }: React.ComponentProps<'p'>) {
  const { formDescriptionId } = useFormField();
  const [collapsed, setCollapsed] = React.useState(true);

  const toggleCollapsed = (e: { preventDefault: () => void }) => {
    setCollapsed(!collapsed);
    e.preventDefault();
  };

  // EDIT: This is customized to allow for collapsible descriptions
  return (
    <div id={formDescriptionId} className={cn('text-muted-foreground font-light relative -mt-2! text-sm', className)} {...props}>
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
}

function FormMessage({ className, ...props }: React.ComponentProps<'p'>) {
  const { error, formMessageId, invalid } = useFormField();
  const body = error ? String(error?.message ?? '') : props.children;
  // const body = error ? String(Array.isArray(error) ? error.find((err) => err?.message)?.message : error?.message) : props.children;

  if (!body || !invalid) return null;

  return (
    <p data-slot="form-message" id={formMessageId} className={cn('text-destructive text-sm', className)} {...props}>
      {body}
    </p>
  );
}

export { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, useFormField };
