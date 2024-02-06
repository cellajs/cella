import * as LabelPrimitive from '@radix-ui/react-label';
import { Slot } from '@radix-ui/react-slot';
import * as React from 'react';
import { Controller, ControllerProps, FieldPath, FieldValues, FormProvider, FormProviderProps, useFormContext } from 'react-hook-form';

import { ChevronUp, HelpCircle } from 'lucide-react';
import { useState } from 'react';
import { Label } from '~/modules/ui/label';
import { cn } from '~/lib/utils';
import { Badge } from './badge';
import { Button } from './button';

// biome-ignore lint/suspicious/noExplicitAny: any is required here
const Form = <TFieldValues extends FieldValues, TContext = any, TTransformedValues extends FieldValues = TFieldValues>({
  children,
  unsavedChanges,
  ...props
}: FormProviderProps<TFieldValues, TContext, TTransformedValues> & {
  unsavedChanges?: boolean;
}) => {
  return (
    <FormProvider {...props}>
      {unsavedChanges && <Badge className="w-fit">Unsaved changes</Badge>}
      {children}
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
  const { getFieldState, formState } = useFormContext();

  const fieldState = getFieldState(fieldContext.name, formState);

  if (!fieldContext) {
    throw new Error('useFormField should be used within <FormField>');
  }

  const { id } = itemContext;

  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  };
};

type FormItemContextValue = {
  id: string;
};

const FormItemContext = React.createContext<FormItemContextValue>({} as FormItemContextValue);

const FormItem = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => {
  const id = React.useId();

  return (
    <FormItemContext.Provider value={{ id }}>
      <div ref={ref} className={cn('space-y-2', className)} {...props} />
    </FormItemContext.Provider>
  );
});
FormItem.displayName = 'FormItem';

const FormLabel = React.forwardRef<React.ElementRef<typeof LabelPrimitive.Root>, React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>>(
  ({ className, ...props }, ref) => {
    const { error, formItemId } = useFormField();

    return <Label ref={ref} className={cn(error && 'text-destructive', className)} htmlFor={formItemId} {...props} />;
  },
);
FormLabel.displayName = 'FormLabel';

const FormControl = React.forwardRef<React.ElementRef<typeof Slot>, React.ComponentPropsWithoutRef<typeof Slot>>(({ ...props }, ref) => {
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

    // REMINDER: This is customized to allow for collapsible descriptions
    return (
      <div ref={ref} id={formDescriptionId} className={cn('text-muted-foreground font-light relative !mt-0 text-sm', className)} {...props}>
        <div className="flex justify-between">
          <Button
            variant="link"
            size="sm"
            onClick={toggleCollapsed}
            className="right-1 -top-7 absolute text-regular opacity-50 hover:opacity-100 p-2 h-auto"
          >
            {collapsed && <HelpCircle size={16} />}
            {!collapsed && <ChevronUp size={16} />}
          </Button>
          {!collapsed && <span>{children}</span>}
        </div>
      </div>
    );
  },
);
FormDescription.displayName = 'FormDescription';

const FormMessage = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(({ className, children, ...props }, ref) => {
  const { error, formMessageId } = useFormField();
  const body = error ? String(Array.isArray(error) ? error[0].value.message : error?.message) : children;

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

export { useFormField, Form, FormItem, FormLabel, FormControl, FormDescription, FormMessage, FormField };
