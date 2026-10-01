// @vitest-environment jsdom
import type * as React from 'react';
import { act, createRef, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('i18next', () => ({ default: { t: (key: string) => key }, t: (key: string) => key }));

const { Badge } = await import('~/modules/ui/badge');
const { Button } = await import('~/modules/ui/button');
const { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } = await import('~/modules/ui/select');
const { Tabs, TabsList, TabsTrigger } = await import('~/modules/ui/tabs');
const { Textarea } = await import('~/modules/ui/textarea');
const { Form, FormField, FormItem } = await import('~/modules/ui/field');
const { SelectRoleRadio } = await import('~/modules/common/form-fields/select-role-radio');
const { SelectRoles } = await import('~/modules/common/form-fields/select-roles');
const { TotpConfirmationForm } = await import('~/modules/auth/totp-verify-code-form');
const { useForm } = await import('react-hook-form');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let container: HTMLDivElement;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
});

async function render(node: ReactNode) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(node));
  return container;
}

/** Types `text` into an input the way a browser does: set the value, then fire `input`. */
async function typeInto(input: HTMLInputElement, text: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setValue?.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('render prop', () => {
  it('renders a Button as its render element, keeping link semantics and merging refs and handlers', async () => {
    const outerRef = createRef<HTMLAnchorElement>();
    const innerRef = createRef<HTMLAnchorElement>();
    const onOuterClick = vi.fn();
    const onInnerClick = vi.fn((event: React.MouseEvent) => event.preventDefault());
    const el = await render(
      <Button
        ref={outerRef as unknown as React.Ref<HTMLButtonElement>}
        variant="plain"
        className="caller-class"
        onClick={onOuterClick}
        render={<a ref={innerRef} href="/docs" className="link-class" onClick={onInnerClick} />}
      >
        Docs
      </Button>,
    );
    const link = el.querySelector('a') as HTMLAnchorElement;

    expect(el.querySelector('button')).toBeNull();
    expect(link.textContent).toBe('Docs');
    expect(link.hasAttribute('type')).toBe(false);
    expect(link.getAttribute('data-slot')).toBe('button');
    expect(link.className).toContain('caller-class');
    expect(link.className).toContain('link-class');
    expect(outerRef.current).toBe(link);
    expect(innerRef.current).toBe(link);

    await act(async () => link.click());
    expect(onInnerClick).toHaveBeenCalledTimes(1);
    expect(onOuterClick).toHaveBeenCalledTimes(1);
  });

  it('renders a Badge through its render element', async () => {
    const el = await render(<Badge render={<a href="/new" />}>New</Badge>);
    const link = el.querySelector('a') as HTMLAnchorElement;

    expect(link.textContent).toBe('New');
    expect(link.getAttribute('data-slot')).toBe('badge');
  });
});

describe('Button', () => {
  it('does not submit a surrounding form unless it asks to', async () => {
    const onSubmit = vi.fn((event: SubmitEvent) => event.preventDefault());
    const el = await render(
      <form onSubmit={(event) => onSubmit(event.nativeEvent as SubmitEvent)}>
        <Button>Revert</Button>
        <Button type="submit">Save</Button>
      </form>,
    );
    const [revert, save] = el.querySelectorAll('button');

    expect(revert.getAttribute('type')).toBe('button');
    await act(async () => revert.click());
    expect(onSubmit).not.toHaveBeenCalled();

    await act(async () => save.click());
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('disables itself and marks busy while loading, keeping its content for layout', async () => {
    const onClick = vi.fn();
    const el = await render(
      <Button loading onClick={onClick}>
        Create
      </Button>,
    );
    const button = el.querySelector('button') as HTMLButtonElement;

    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.textContent).toBe('Create');
    expect(button.querySelector('.animate-spin')).not.toBeNull();
    await act(async () => button.click());
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('Select', () => {
  it('shows the label from `items` before the popup has ever opened', async () => {
    const el = await render(
      <Select value="active" items={[{ value: 'active', label: 'Active tenant' }]}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="active">Active tenant</SelectItem>
        </SelectContent>
      </Select>,
    );

    expect(el.querySelector('[data-slot="select-value"]')?.textContent).toBe('Active tenant');
  });
});

describe('TabsTrigger', () => {
  it('marks the active tab with the attribute its styles target and keeps caller classes', async () => {
    const el = await render(
      <Tabs defaultValue="upload">
        <TabsList>
          <TabsTrigger value="upload" className="caller-class">
            Upload
          </TabsTrigger>
          <TabsTrigger value="embed">Embed</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    const [upload, embed] = el.querySelectorAll('[data-slot="tabs-trigger"]');

    expect(upload.hasAttribute('data-active')).toBe(true);
    expect(embed.hasAttribute('data-active')).toBe(false);
    expect(upload.className).toContain('data-active:bg-secondary');
    expect(upload.className).toContain('caller-class');
  });
});

describe('Textarea', () => {
  it('hands the node to a caller ref while auto-resize keeps working', async () => {
    const ref = createRef<HTMLTextAreaElement>();
    const el = await render(<Textarea ref={ref} autoResize />);
    const textarea = el.querySelector('textarea') as HTMLTextAreaElement;

    expect(ref.current).toBe(textarea);
    // Auto-resize writes an explicit height once it holds the node; without it the height stays unset.
    expect(textarea.style.height).not.toBe('');
  });
});

describe('TOTP confirmation form', () => {
  it('submits the typed code without throwing and labels the first slot', async () => {
    const errors: unknown[] = [];
    const onError = (event: ErrorEvent) => {
      errors.push(event.error);
      event.preventDefault();
    };
    window.addEventListener('error', onError);
    const onSubmit = vi.fn();

    try {
      const el = await render(<TotpConfirmationForm label="Code" onSubmit={onSubmit} onCancel={() => {}} />);
      const inputs = [...el.querySelectorAll('input')];
      const label = el.querySelector('label');

      expect(inputs.length).toBeGreaterThan(1);
      expect(label?.htmlFor).toBe(inputs[0].id);

      await typeInto(inputs[0], '123456');
      await act(async () => (el.querySelector('button[type="submit"]') as HTMLButtonElement).click());

      expect(errors).toEqual([]);
      expect(onSubmit).toHaveBeenCalledWith({ code: '123456' });
    } finally {
      window.removeEventListener('error', onError);
    }
  });
});

describe('role selectors in a form field', () => {
  function RoleForm() {
    const form = useForm<{ role?: 'admin' | 'member' }>();
    return (
      <Form {...form}>
        <FormField
          control={form.control}
          name="role"
          render={({ field: { value, onChange } }) => (
            <FormItem name="role">
              <SelectRoleRadio value={value} onValueChange={onChange} label="Role" />
            </FormItem>
          )}
        />
      </Form>
    );
  }

  const nameOf = (el: Element) =>
    (el.getAttribute('aria-labelledby') ?? '')
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ')
      .trim();

  it('names the group by its legend and each option by its own label', async () => {
    const el = await render(<RoleForm />);
    const group = el.querySelector('[role="radiogroup"]') as HTMLElement;
    const radios = [...el.querySelectorAll('[role="radio"]')];

    expect(nameOf(group)).toBe('Role');
    expect(radios.map(nameOf)).toEqual(radios.map((_, i) => el.querySelectorAll('label')[i].textContent));
    expect(new Set(radios.map(nameOf)).size).toBe(radios.length);
  });

  it('names each role checkbox by its own label inside a form field', async () => {
    function RolesForm() {
      const form = useForm<{ roles: ('admin' | 'member')[] }>({ defaultValues: { roles: [] } });
      return (
        <Form {...form}>
          <FormField
            control={form.control}
            name="roles"
            render={({ field: { value, onChange } }) => (
              <FormItem name="roles">
                <SelectRoles value={value} onValueChange={onChange} label="Roles" />
              </FormItem>
            )}
          />
        </Form>
      );
    }
    const el = await render(<RolesForm />);
    const checkboxes = [...el.querySelectorAll('[role="checkbox"]')];

    expect(checkboxes.length).toBeGreaterThan(1);
    expect(new Set(checkboxes.map(nameOf)).size).toBe(checkboxes.length);
  });

  it('selects the option whose label is clicked', async () => {
    const el = await render(<RoleForm />);
    const labels = [...el.querySelectorAll('label')];
    const radios = [...el.querySelectorAll('[role="radio"]')];

    await act(async () => labels[1].click());

    expect(radios[1].getAttribute('aria-checked')).toBe('true');
    expect(radios[0].getAttribute('aria-checked')).toBe('false');
  });
});
