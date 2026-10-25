import { describe, expect, it } from 'vitest';
import { frontendFindings } from './check-frontend-style.ts';

const file = 'frontend/src/modules/example/use-example.ts';
const rules = (source: string) => frontendFindings(file, source, new Set()).map(({ rule, message }) => `${rule}: ${message}`);

describe('memo-dependency-unread', () => {
  it('reports a dependency the callback never reads', () => {
    const source = 'const menu = useMemo(() => buildMenu(userId), [userId, recomputeKey]);';
    expect(rules(source)).toEqual([expect.stringMatching(/^memo-dependency-unread: recomputeKey is a dependency the callback never reads/)]);
  });

  it('accepts dependencies read through a property, a call or a nested function', () => {
    const source = [
      'const a = useMemo(() => items.filter((item) => item.id === selected.id), [items, selected.id]);',
      'const b = useCallback(() => store.getState().close(id), [store, id]);',
    ].join('\n');
    expect(rules(source)).toEqual([]);
  });

  it('leaves a callback passed by name alone', () => {
    expect(rules('const run = useCallback(handler, [handler, version]);')).toEqual([]);
  });
});

describe('route-context-selector', () => {
  it('reports route context read whole, through a route api or the router hook', () => {
    const source = ['const context = routeApi.useRouteContext();', "const { organization } = useRouteContext({ from: '/board' });"].join('\n');
    expect(rules(source)).toEqual([
      expect.stringMatching(/^route-context-selector: useRouteContext\(\) renders again on every navigation/),
      expect.stringMatching(/^route-context-selector: /),
    ]);
  });

  it('accepts a selected value, and options passed by name or spread', () => {
    const source = [
      'const organizationId = routeApi.useRouteContext({ select: (context) => context.organization.id });',
      'const tenantId = routeApi.useRouteContext(options);',
      "const slug = useRouteContext({ from: '/board', ...rest });",
    ].join('\n');
    expect(rules(source)).toEqual([]);
  });
});

describe('form-no-validate and form-resolver', () => {
  const component = 'frontend/src/modules/example/example-form.tsx';
  const found = (source: string) => frontendFindings(component, source, new Set()).map(({ rule }) => rule);

  it('reports a form react-hook-form validates without noValidate, and a direct zodResolver import', () => {
    const source = [
      "import { zodResolver } from '@hookform/resolvers/zod';",
      'export function ExampleForm() {',
      '  return <form onSubmit={form.handleSubmit(onSubmit)} />;',
      '}',
    ].join('\n');
    expect(found(source)).toEqual(['form-resolver', 'form-no-validate']);
  });

  it('accepts noValidate, a form the browser posts, and the resolver module itself', () => {
    const source = [
      'export function ExampleForm() {',
      '  return (',
      '    <>',
      '      <form noValidate onSubmit={form.handleSubmit(onSubmit)} />',
      '      <form method="post" action="/confirm" />',
      '    </>',
      '  );',
      '}',
    ].join('\n');
    expect(found(source)).toEqual([]);
    expect(frontendFindings('frontend/src/utils/form-resolver.ts', "import { zodResolver } from '@hookform/resolvers/zod';", new Set())).toEqual([]);
  });
});

describe('button-press-cancel', () => {
  const component = 'frontend/src/modules/example/example.tsx';
  const found = (source: string) => frontendFindings(component, source, new Set()).map(({ rule }) => rule);

  it('reports a Button that cancels the press nudge with a translate class, plain, important or conditional', () => {
    const source = [
      'export function Example({ flat }: { flat: boolean }) {',
      '  return (',
      '    <>',
      '      <Button className="size-6 active:translate-y-0" />',
      '      <Button className="active:translate-y-0!" />',
      "      <Button className={cn('size-6', flat && 'active:translate-y-0')} />",
      '    </>',
      '  );',
      '}',
    ].join('\n');
    expect(found(source)).toEqual(['button-press-cancel', 'button-press-cancel', 'button-press-cancel']);
  });

  it('accepts press={false}, and the class on an element that is no Button', () => {
    const source = [
      'export function Example() {',
      '  return (',
      '    <>',
      '      <Button press={false} className="size-6" />',
      '      <div className="hover:-translate-y-1 active:translate-y-0" />',
      '    </>',
      '  );',
      '}',
    ].join('\n');
    expect(found(source)).toEqual([]);
  });
});

describe('reorder-grip', () => {
  const component = 'frontend/src/modules/example/example.tsx';
  const found = (source: string, path = component) => frontendFindings(path, source, new Set()).map(({ rule }) => rule);
  const gripImport = "import { GripVerticalIcon } from 'lucide-react';";

  it('reports a grip icon in a file that renders no reorder handle', () => {
    expect(found(gripImport)).toEqual(['reorder-grip']);
  });

  it('accepts a grip beside ReorderHandle or reorderColumn, and in the drag preview', () => {
    expect(found(`${gripImport}\nimport { ReorderHandle } from '~/modules/common/reorder-handle/reorder-handle';`)).toEqual([]);
    expect(found(`${gripImport}\nimport { reorderColumn } from '~/modules/common/data-table/reorder-column';`)).toEqual([]);
    expect(found(gripImport, 'frontend/src/modules/common/data-table/row-drag-preview.tsx')).toEqual([]);
  });
});
