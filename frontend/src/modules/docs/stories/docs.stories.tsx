import type { Meta, StoryObj } from '@storybook/react-vite';
import { Suspense } from 'react';
import type { GenComponentSchema, GenOperationDetail, GenOperationSummary, GenResponseSummary } from 'sdk/docs-types';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { getSection } from '~/hooks/use-scroll-spy-store';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { OperationExamples } from '~/modules/docs/operations/operation-examples';
import { OperationResponses } from '~/modules/docs/operations/operation-responses';
import { TagSchemasTable } from '~/modules/docs/schemas/tag-schemas-table';
import { OperationItem } from '~/modules/docs/sidebar/operation-item';
import { SchemaItem } from '~/modules/docs/sidebar/schema-item';
import { TagOperationsTable } from '~/modules/docs/tag-operations-table';
import { getRouter } from '~/routes/-router-instance';
import { withApp } from '~/stories/with-app';

// ─── Fixtures shaped like the generated docs JSON ────────────────────────────

const operation = (id: string, summary: string, method: string, path: string, hash: string): GenOperationSummary => ({
  id,
  hash,
  method,
  path,
  tags: ['me'],
  summary,
  description: '',
  deprecated: false,
  hasParams: false,
  hasRequestBody: false,
  hasResponseBody: true,
  hasExample: true,
  extensions: {},
  tagsByKind: {},
});

const operations = [
  operation('getMe', 'Get me', 'get', '/me', 'tag/me/get/me'),
  operation('getMySessions', 'Get my sessions', 'get', '/me/sessions', 'tag/me/get/me-sessions'),
];

const schema = (name: string, tagsByKind: Record<string, string[]> = {}): GenComponentSchema => ({
  name,
  ref: `#/components/schemas/${name}`,
  type: 'object',
  schema: { type: 'object', properties: { id: { type: 'string' } } },
  schemaTag: 'data',
  tagsByKind,
});

const schemas = [
  schema('UserBase', { module: ['users'] }),
  schema('SessionBase', { module: ['me'] }),
  schema('BadRequestError'),
];

const response = (status: number, description: string, extra: Partial<GenResponseSummary> = {}) => ({
  status,
  description,
  ...extra,
});

const docsQueries = (details: GenOperationDetail[]): [readonly unknown[], unknown][] => [
  [['docs', 'schemas'], schemas],
  [['docs', 'zod-index'], new Map([['zGetMeResponse', 'export const zGetMeResponse = z.object({ id: z.string() });']])],
  [['docs', 'types-index'], new Map([['GetMeResponse', 'export type GetMeResponse = { id: string };']])],
  [['docs', 'tag-details', 'me'], details],
];

/** A tall page with a scroll-spy anchor far below the fold, so a queued scroll has somewhere to go. */
function WithAnchor({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <div>
      {children}
      <div className="h-[150vh]" />
      <div id={`spy-${id}`} className="h-10">
        anchor
      </div>
      <div className="h-screen" />
    </div>
  );
}

const meta = {
  title: 'docs/Docs',
  decorators: [withApp],
  // The harness has only a root route, so `to: '.'` links resolve to `/`
  parameters: { layout: 'fullscreen', app: { url: '/?q=keep' } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

// ─── Tag tables ──────────────────────────────────────────────────────────────

/** A path link scrolls to the operation and sets operationTag, keeping other search params. */
export const OperationsTagTable: Story = {
  render: () => (
    <WithAnchor id="tag/me/get/me-sessions">
      <TagOperationsTable operations={operations} tagName="me" />
    </WithAnchor>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const link = await canvas.findByTitle('/me/sessions');
    await expect(link).toHaveAttribute('href', '/?q=keep&operationTag=me#tag/me/get/me-sessions');
    await expect(canvas.queryAllByRole('columnheader')).toHaveLength(0);
    await expect(canvas.getByText('getMySessions')).toBeVisible();

    await userEvent.click(link);

    await waitFor(() => expect(getSection()).toBe('tag/me/get/me-sessions'));
    const { location } = getRouter().state;
    await expect(location.pathname).toBe('/');
    await expect(location.hash).toBe('tag/me/get/me-sessions');
    await expect(location.search).toEqual({ q: 'keep', operationTag: 'me' });
  },
};

/** A schema name link scrolls to the schema and sets schemaTag; tag kinds render as columns with a header. */
export const SchemasTagTable: Story = {
  render: () => (
    <WithAnchor id="/components/schemas/SessionBase">
      <TagSchemasTable schemas={schemas} tagName="data" tagKinds={['module']} />
    </WithAnchor>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const link = await canvas.findByRole('link', { name: 'SessionBase' });
    await expect(link).toHaveAttribute('href', '/?q=keep&schemaTag=data#/components/schemas/SessionBase');
    await expect(canvas.getByRole('columnheader', { name: 'Name' })).toBeVisible();
    await expect(canvas.getByRole('columnheader', { name: 'Module' })).toBeVisible();
    await expect(canvas.getByText('users')).toBeVisible();

    await userEvent.click(link);

    await waitFor(() => expect(getSection()).toBe('/components/schemas/SessionBase'));
    const { location } = getRouter().state;
    await expect(location.pathname).toBe('/');
    await expect(location.hash).toBe('/components/schemas/SessionBase');
    await expect(location.search).toEqual({ q: 'keep', schemaTag: 'data' });
  },
};

// ─── Sidebar items ───────────────────────────────────────────────────────────

const sidebarOnClose = fn();

/** Sidebar rows link to their hash, mark the active row, and on click scroll there and close the sidebar sheet. */
export const SidebarItems: Story = {
  beforeEach: () => {
    sidebarOnClose.mockClear();
    useSheeter.setState({ sheets: [] });
    return () => useSheeter.setState({ sheets: [] });
  },
  render: () => (
    <WithAnchor id="tag/me/get/me">
      <div className="flex w-64 flex-col">
        <OperationItem operation={operations[0]} isActive={false} />
        <OperationItem operation={operations[1]} isActive />
        <SchemaItem schema={schemas[0]} isActive />
      </div>
    </WithAnchor>
  ),
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    const openSidebarSheet = () =>
      useSheeter.getState().create(null, {
        id: 'docs-sidebar',
        side: 'left',
        triggerRef: { current: null },
        onClose: sidebarOnClose,
      });

    const getMe = await canvas.findByRole('link', { name: /^Get me\s*get$/ });
    const sessions = canvas.getByRole('link', { name: /^Get my sessions\s*get$/ });
    const userBase = canvas.getByRole('link', { name: 'UserBase' });

    await expect(getMe).toHaveAttribute('href', '/docs/operations#tag/me/get/me');
    await expect(userBase).toHaveAttribute('href', '/docs/schemas#/components/schemas/UserBase');
    await expect(getMe).toHaveAttribute('data-active', 'false');
    await expect(sessions).toHaveAttribute('data-active', 'true');
    await expect(userBase).toHaveAttribute('data-active', 'true');

    await step('operation row', async () => {
      openSidebarSheet();
      await userEvent.click(getMe);

      await waitFor(() => expect(getSection()).toBe('tag/me/get/me'));
      await expect(useSheeter.getState().get('docs-sidebar')).toBeUndefined();
      await expect(sidebarOnClose).toHaveBeenCalledTimes(1);
      // The click scrolls in place; the router stays where it was
      await expect(getRouter().state.location.pathname).toBe('/');
      await expect(getRouter().state.location.hash).toBe('');
    });

    await step('schema row', async () => {
      openSidebarSheet();
      await userEvent.click(userBase);

      await expect(useSheeter.getState().get('docs-sidebar')).toBeUndefined();
      await expect(sidebarOnClose).toHaveBeenCalledTimes(2);
      await expect(getRouter().state.location.hash).toBe('');
    });
  },
};

// ─── Responses and examples ──────────────────────────────────────────────────

const meDetail: GenOperationDetail = {
  operationId: 'getMe',
  responses: [
    response(200, 'Current user', { schema: schemas[0].schema, example: { id: 'u1' } }),
    response(400, 'Bad request', { name: 'BadRequestError', example: { message: 'bad' } }),
    response(404, 'Not found'),
  ],
};

/** Every response is listed collapsed, in format view; a response without a schema says so. */
export const Responses: Story = {
  parameters: { app: { queryData: docsQueries([meDetail]) } },
  render: () => (
    <Suspense fallback="loading">
      <OperationResponses detail={meDetail} />
    </Suspense>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const ok = await canvas.findByRole('button', { name: /200\s*Current user/ });
    const badRequest = canvas.getByRole('button', { name: /400\s*Bad request\s*BadRequestError/ });
    const notFound = canvas.getByRole('button', { name: /404\s*Not found/ });
    for (const trigger of [ok, badRequest, notFound]) await expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(ok);
    await expect(ok).toHaveAttribute('aria-expanded', 'true');
    await expect(await canvas.findByRole('button', { name: /view_format/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas.getByRole('button', { name: /view_example/ })).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(notFound);
    await expect(await canvas.findByText(/no_response_body/)).toBeVisible();
  },
};

/** No responses: the responses empty state. */
export const ResponsesEmpty: Story = {
  parameters: { app: { queryData: docsQueries([]) } },
  render: () => (
    <Suspense fallback="loading">
      <OperationResponses detail={{ operationId: 'getMe', responses: [] }} />
    </Suspense>
  ),
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText(/no_responses_defined/)).toBeVisible();
  },
};

/**
 * Only responses with an example are listed, the first one open in example view. A 2xx example decides
 * whether anything is listed, yet an error response with an example is listed too.
 */
export const Examples: Story = {
  parameters: { app: { queryData: docsQueries([meDetail]) } },
  render: () => (
    <Suspense fallback="loading">
      <OperationExamples operationId="getMe" tagName="me" />
    </Suspense>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const ok = await canvas.findByRole('button', { name: /200\s*Current user/ });
    const badRequest = canvas.getByRole('button', { name: /400\s*Bad request/ });
    await expect(canvas.queryByRole('button', { name: /404/ })).toBeNull();

    await expect(ok).toHaveAttribute('aria-expanded', 'true');
    await expect(badRequest).toHaveAttribute('aria-expanded', 'false');
    await expect(canvas.getByRole('button', { name: /view_example/ })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(badRequest);
    await expect(badRequest).toHaveAttribute('aria-expanded', 'true');
    const panel = document.getElementById(badRequest.getAttribute('aria-controls') ?? '') as HTMLElement;
    await expect(await within(panel).findByRole('button', { name: /view_example/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  },
};

const errorOnlyDetail: GenOperationDetail = {
  operationId: 'getMe',
  responses: [response(200, 'Current user'), response(400, 'Bad request', { example: { message: 'bad' } })],
};

/** Without a 2xx example the examples view shows its empty state, even when an error response has one. */
export const ExamplesWithoutSuccessExample: Story = {
  parameters: { app: { queryData: docsQueries([errorOnlyDetail]) } },
  render: () => (
    <Suspense fallback="loading">
      <OperationExamples operationId="getMe" tagName="me" />
    </Suspense>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText(/no_examples_defined/)).toBeVisible();
    await expect(canvas.queryByRole('button', { name: /400/ })).toBeNull();
  },
};
