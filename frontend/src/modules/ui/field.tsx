import { Field } from '@base-ui/react/field';
import { cva, type VariantProps } from 'class-variance-authority';
import { ChevronUpIcon, CircleQuestionMarkIcon } from 'lucide-react';
import * as React from 'react';
import type { ControllerProps, FieldPath, FieldValues, FormProviderProps } from 'react-hook-form';
import { Controller, FormProvider, useFormContext, useFormState } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Button } from '~/modules/ui/button';
import { Label } from '~/modules/ui/label';
import { Separator } from '~/modules/ui/separator';
import { cn } from '~/utils/cn';

// Layout primitives (no RHF dependency)

export function FieldSet({ className, ...props }: React.ComponentProps<'fieldset'>) {
  return (
    <fieldset
      data-slot="field-set"
      className={cn(
        'flex flex-col gap-6',
        'has-[>[data-slot=checkbox-group]]:gap-3 has-[>[data-slot=radio-group]]:gap-3',
        className,
      )}
      {...props}
    />
  );
}

export function FieldLegend({
  className,
  variant = 'legend',
  ...props
}: React.ComponentProps<'legend'> & { variant?: 'legend' | 'label' }) {
  return (
    <legend
      data-slot="field-legend"
      data-variant={variant}
      className={cn('mb-3 font-medium', 'data-[variant=legend]:text-base', 'data-[variant=label]:text-sm', className)}
      {...props}
    />
  );
}

export function FieldGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="field-group"
      className={cn(
        'group/field-group @container/field-group flex w-full flex-col gap-7 data-[slot=checkbox-group]:gap-3 *:data-[slot=field-group]:gap-4',
        className,
      )}
      {...props}
    />
  );
}

const fieldLayoutVariants = cva('group/field flex w-full gap-3 data-[invalid=true]:text-destructive', {
  variants: {
    orientation: {
      vertical: ['flex-col [&>*]:w-full [&>.sr-only]:w-auto'],
      horizontal: [
        'flex-row items-center',
        '[&>[data-slot=field-label]]:flex-auto',
        'has-[>[data-slot=field-content]]:items-start has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px',
      ],
      responsive: [
        '@md/field-group:flex-row flex-col @md/field-group:items-center @md/field-group:[&>*]:w-auto [&>*]:w-full [&>.sr-only]:w-auto',
        '@md/field-group:[&>[data-slot=field-label]]:flex-auto',
        '@md/field-group:has-[>[data-slot=field-content]]:items-start @md/field-group:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px',
      ],
    },
  },
  defaultVariants: {
    orientation: 'vertical',
  },
});

export function FieldLayout({
  className,
  orientation = 'vertical',
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof fieldLayoutVariants>) {
  return (
    <div
      role="group"
      data-slot="field"
      data-orientation={orientation}
      className={cn(fieldLayoutVariants({ orientation }), className)}
      {...props}
    />
  );
}

export function FieldContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="field-content"
      className={cn('group/field-content flex flex-1 flex-col gap-1.5 leading-snug', className)}
      {...props}
    />
  );
}

export function FieldLabel({ className, ...props }: React.ComponentProps<typeof Label>) {
  return (
    <Label
      data-slot="field-label"
      className={cn(
        'group/field-label peer/field-label flex w-fit gap-2 leading-snug group-data-[disabled=true]/field:opacity-50',
        'has-[>[data-slot=field]]:w-full has-[>[data-slot=field]]:flex-col has-[>[data-slot=field]]:rounded-md has-[>[data-slot=field]]:border *:data-[slot=field]:p-4',
        'has-data-[state=checked]:border-primary has-data-[state=checked]:bg-primary/5 dark:has-data-[state=checked]:bg-primary/10',
        className,
      )}
      {...props}
    />
  );
}

export function FieldTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="field-label"
      className={cn(
        'flex w-fit items-center gap-2 font-medium text-sm leading-snug group-data-[disabled=true]/field:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export function FieldDescription({ className, ...props }: React.ComponentProps<'p'>) {
  const [collapsed, setCollapsed] = React.useState(true);

  const toggleCollapsed = (e: { preventDefault: () => void }) => {
    setCollapsed(!collapsed);
    e.preventDefault();
  };

  return (
    <div
      data-slot="field-description"
      className={cn('relative -mt-2! text-muted-foreground text-sm', className)}
      {...props}
    >
      <div className="flex justify-between">
        <Button
          type="button"
          variant="link"
          size="sm"
          onClick={toggleCollapsed}
          className="absolute -top-6 right-1 h-auto p-2 text-regular opacity-50 ring-inset hover:opacity-100"
        >
          {collapsed && <CircleQuestionMarkIcon />}
          {!collapsed && <ChevronUpIcon />}
        </Button>
        {!collapsed && <span className="py-1">{props.children}</span>}
      </div>
    </div>
  );
}

export function FieldSeparator({
  children,
  className,
  ...props
}: React.ComponentProps<'div'> & {
  children?: React.ReactNode;
}) {
  return (
    <div
      data-slot="field-separator"
      data-content={!!children}
      className={cn('relative -my-2 h-5 text-sm group-data-[variant=outline]/field-group:-mb-2', className)}
      {...props}
    >
      <Separator className="absolute inset-0 top-1/2" />
      {children && (
        <span
          className="relative mx-auto block w-fit bg-background px-2 text-muted-foreground"
          data-slot="field-separator-content"
        >
          {children}
        </span>
      )}
    </div>
  );
}

export function FieldError({
  className,
  children,
  errors,
  ...props
}: React.ComponentProps<'div'> & {
  errors?: Array<{ message?: string } | undefined>;
}) {
  const content = (() => {
    if (children) return children;
    if (!errors) return null;
    if (errors.length === 1 && errors[0]?.message) return errors[0].message;
    return (
      <ul className="ml-4 flex list-disc flex-col gap-1">
        {errors.map(
          (error, index) =>
            // biome-ignore lint/suspicious/noArrayIndexKey: error list rendered once at validation time; not reordered.
            error?.message && <li key={index}>{error.message}</li>,
        )}
      </ul>
    );
  })();

  if (!content) return null;

  return (
    <div
      role="alert"
      data-slot="field-error"
      className={cn('font-normal text-destructive text-sm', className)}
      {...props}
    >
      {content}
    </div>
  );
}

// RHF + base-ui Field integration

export type LabelDirectionType = 'top' | 'left';
const LabelDirectionContext = React.createContext<LabelDirectionType>('top');

interface FieldStateContextValue {
  invalid: boolean;
  isDirty: boolean;
  isTouched: boolean;
  error?: { message?: string };
}

const FieldStateContext = React.createContext<FieldStateContextValue>({
  invalid: false,
  isDirty: false,
  isTouched: false,
});

/** Read RHF field state from within a FormField render prop tree. */
export function useFieldState() {
  return React.useContext(FieldStateContext);
}

type FormProps<
  TFieldValues extends FieldValues,
  TContext = unknown,
  TTransformedValues extends FieldValues = TFieldValues,
> = FormProviderProps<TFieldValues, TContext, TTransformedValues> & {
  unsavedChanges?: boolean;
  labelDirection?: LabelDirectionType;
};

export const Form = <
  TFieldValues extends FieldValues,
  TContext = unknown,
  TTransformedValues extends FieldValues = TFieldValues,
>({
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

export function FormField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({ render, ...props }: ControllerProps<TFieldValues, TName>) {
  const { getFieldState } = useFormContext();
  const formState = useFormState({ name: props.name });

  return (
    <Controller
      {...props}
      render={(renderProps) => {
        const fieldState = getFieldState(props.name, formState);
        return (
          <FieldStateContext.Provider
            value={{
              invalid: fieldState.invalid,
              isDirty: fieldState.isDirty,
              isTouched: fieldState.isTouched,
              error: fieldState.error,
            }}
          >
            {render(renderProps)}
          </FieldStateContext.Provider>
        );
      }}
    />
  );
}

export function FormItem({ className, name, ...props }: Omit<React.ComponentProps<'div'>, 'name'> & { name?: string }) {
  const labelDirection = React.useContext(LabelDirectionContext);
  const { invalid, isDirty, isTouched } = useFieldState();

  return (
    <Field.Root
      data-slot="form-item"
      name={name}
      id={name ? `${name.toLowerCase()}-form-item-container` : undefined}
      invalid={invalid}
      dirty={isDirty}
      touched={isTouched}
      className={cn(`${labelDirection === 'top' ? 'flex-col' : 'flex-row items-center'} flex gap-2`, className)}
      {...props}
    />
  );
}

export function FormLabel({
  className,
  nativeLabel = true,
  ...props
}: React.ComponentProps<'label'> & { nativeLabel?: boolean }) {
  return (
    <Field.Label
      data-slot="form-label"
      nativeLabel={nativeLabel}
      className={cn('w-fit select-none font-medium text-sm/4.5 data-invalid:text-destructive', className)}
      {...props}
    />
  );
}

/**
 * Wraps a single child in Base UI's `Field.Control`, which injects native field props
 * (event-based `onChange`, `id`, `aria-*`) onto that child for accessibility and validation wiring.
 *
 * Only use this for native inputs or components that accept and consume those injected props
 * (e.g. `Input`, `Checkbox`, Shadcn `Select`). Custom selectors that expose a value-based
 * callback (`onValueChange`) must NOT be wrapped here: place them directly inside `FormItem`
 * and bind to `field.value` / `field.onChange` instead. Wrapping such a component causes Base UI
 * to call its event handler with a non-event value and crash (`reading 'defaultPrevented'`).
 */
export function FormControl({ children }: { children: React.ReactElement }) {
  return <Field.Control render={children} />;
}

export function FormDescription({ className, children, ...props }: React.ComponentProps<'p'>) {
  const [collapsed, setCollapsed] = React.useState(true);

  const toggleCollapsed = (e: { preventDefault: () => void }) => {
    setCollapsed(!collapsed);
    e.preventDefault();
  };

  return (
    <Field.Description
      render={<div />}
      className={cn('relative -mt-2! text-muted-foreground text-sm', className)}
      {...props}
    >
      <div className="flex justify-between">
        <Button
          type="button"
          variant="link"
          size="sm"
          onClick={toggleCollapsed}
          className="absolute -top-6 right-1 h-auto p-2 text-regular opacity-50 ring-inset hover:opacity-100"
        >
          {collapsed && <CircleQuestionMarkIcon />}
          {!collapsed && <ChevronUpIcon />}
        </Button>
        {!collapsed && <span className="py-1">{children}</span>}
      </div>
    </Field.Description>
  );
}

export function FormMessage({ className, children, ...props }: React.ComponentProps<'p'>) {
  const { t, i18n } = useTranslation();
  const { error } = useFieldState();
  const message = error?.message ?? '';
  const body = error ? (message && i18n?.exists?.(message) ? t(message) : message) : children;

  if (!body) return null;

  return (
    <Field.Error
      match={!!error}
      render={<p />}
      data-slot="form-message"
      className={cn('text-destructive text-sm', className)}
      {...props}
    >
      {body}
    </Field.Error>
  );
}
