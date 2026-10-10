import type { PgColumn } from 'drizzle-orm/pg-core';
import { type ChannelEntityType, type EntityHierarchy, entityIdColumnName, hierarchy, type ProductEntityType } from 'shared';
import { makeDeepHierarchy } from 'shared/testing/deep-fixture';
import { describe, expect, it } from 'vitest';
import type { OrgContext } from '#/core/context';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { placementFieldsSchema, resolvePlacement, validatePlacement } from '#/permissions/product-placement';
import { homeChannelColumn } from '#/permissions/row-predicates';
import type { EntityModel } from '#/tables';

// The deep fixture's product and hierarchy are typed apart from the app's config, as its other suites cast them.
const ITEM = 'item' as unknown as ProductEntityType;
const deep = (nullable?: Parameters<typeof makeDeepHierarchy>[0]) => makeDeepHierarchy(nullable) as unknown as EntityHierarchy;

/** `item` lives at any depth, the organization included. */
const anyDepth = deep();
/** `item` lives in a section or in its course: a nullable ancestor under a strict one. */
const mixed = deep(['project', 'courseSection']);
/** `item` lives in a project and nowhere else. */
const strict = deep([]);

const uuid = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

describe('placementFieldsSchema', () => {
  it('offers one optional id per channel a row may live in', () => {
    expect(Object.keys(placementFieldsSchema(ITEM, { hierarchy: anyDepth }))).toEqual(['projectId', 'courseSectionId', 'courseId']);
    const fields = placementFieldsSchema(ITEM, { hierarchy: mixed });
    expect(Object.keys(fields)).toEqual(['projectId', 'courseSectionId', 'courseId']);
    for (const field of Object.values(fields)) expect(field.safeParse(undefined).success).toBe(true);
  });

  it('requires the id where a row has one place to live', () => {
    const fields = placementFieldsSchema(ITEM, { hierarchy: strict });
    expect(Object.keys(fields)).toEqual(['projectId']);
    expect(fields.projectId.safeParse(undefined).success).toBe(false);
    expect(fields.projectId.safeParse(uuid(1)).success).toBe(true);
  });

  it('follows the app hierarchy for its own attachments', () => {
    const levels = hierarchy.possibleHomeChannels('attachment').filter((type) => type !== 'organization');
    expect(Object.keys(placementFieldsSchema('attachment'))).toEqual(levels.map((type) => `${type}Id`));
  });
});

describe('validatePlacement', () => {
  it('lets a row without an id live in the organization, unless the product asks for a channel', () => {
    expect(validatePlacement(ITEM, {}, { hierarchy: anyDepth })).toBeNull();
    expect(validatePlacement(ITEM, {}, { hierarchy: anyDepth, requireChannel: true })?.path).toEqual(['projectId']);
  });

  it('asks for an id where the organization is no place for the row', () => {
    expect(validatePlacement(ITEM, {}, { hierarchy: mixed })?.message).toMatch(/^Missing placement/);
    expect(validatePlacement(ITEM, { courseId: uuid(1) }, { hierarchy: mixed })).toBeNull();
    expect(validatePlacement(ITEM, { courseSectionId: uuid(2) }, { hierarchy: mixed })).toBeNull();
    expect(validatePlacement(ITEM, {}, { hierarchy: strict })?.path).toEqual(['projectId']);
  });

  it('refuses two ids, naming the deepest', () => {
    const issue = validatePlacement(ITEM, { courseId: uuid(1), courseSectionId: uuid(2) }, { hierarchy: mixed });
    expect(issue).toEqual({ path: ['courseSectionId'], message: expect.stringMatching(/^Ambiguous placement/) });
  });
});

describe('resolvePlacement', () => {
  // The lookup is injected, so no connection is read.
  const ctx = {} as OrgContext;
  const channels: Record<string, Record<string, unknown>> = {
    [uuid(3)]: { id: uuid(3), courseSectionId: uuid(2), courseId: uuid(1) },
    [uuid(2)]: { id: uuid(2), courseId: uuid(1) },
    [uuid(4)]: { id: uuid(4), courseSectionId: null, courseId: uuid(1) },
  };
  const seen: [string, ChannelEntityType][] = [];
  const resolveHome = async (_ctx: OrgContext, id: string, type: ChannelEntityType) => {
    seen.push([id, type]);
    return channels[id] as unknown as EntityModel<ChannelEntityType>;
  };

  it('stamps the home and the chain above it from the home row, and nulls the levels below', async () => {
    const section = await resolvePlacement(ctx, ITEM, { courseSectionId: uuid(2), name: 'ignored' }, { hierarchy: anyDepth, resolveHome });
    expect(section.columns).toEqual({ projectId: null, courseSectionId: uuid(2), courseId: uuid(1) });
    expect(section.home?.type).toBe('courseSection');

    const project = await resolvePlacement(ctx, ITEM, { projectId: uuid(3) }, { hierarchy: anyDepth, resolveHome });
    expect(project.columns).toEqual({ projectId: uuid(3), courseSectionId: uuid(2), courseId: uuid(1) });
  });

  it('keeps a null the home row holds for an ancestor of its own', async () => {
    const { columns } = await resolvePlacement(ctx, ITEM, { projectId: uuid(4) }, { hierarchy: anyDepth, resolveHome });
    expect(columns).toEqual({ projectId: uuid(4), courseSectionId: null, courseId: uuid(1) });
  });

  it('takes nothing above the home from the client', async () => {
    seen.length = 0;
    const { columns } = await resolvePlacement(ctx, ITEM, { projectId: uuid(3), courseId: uuid(9) }, { hierarchy: anyDepth, resolveHome });
    expect(columns).toEqual({ projectId: uuid(3), courseSectionId: uuid(2), courseId: uuid(1) });
    expect(seen).toEqual([[uuid(3), 'project']]);
  });

  it('homes a row without an id in the organization: every column null, no lookup', async () => {
    seen.length = 0;
    const placed = await resolvePlacement(ctx, ITEM, {}, { hierarchy: anyDepth, resolveHome });
    expect(placed).toEqual({ columns: { projectId: null, courseSectionId: null, courseId: null }, home: null });
    expect(seen).toEqual([]);
  });
});

describe('homeChannelColumn', () => {
  const column = (name: string) => ({ name }) as unknown as PgColumn;
  const table = { organizationId: column('organization_id'), courseId: column('course_id'), projectId: column('project_id') } as never;

  it('is the declared parent column, whether or not that ancestor is nullable', () => {
    // The scope resolver collects home grants at the parent level in both hierarchies, so the column must match there.
    expect(homeChannelColumn(table, ITEM, anyDepth).name).toBe('project_id');
    expect(homeChannelColumn(table, ITEM, strict).name).toBe('project_id');
  });

  it('is the parent column of the app attachment table', () => {
    const parent: string = hierarchy.getParent('attachment') ?? 'organization';
    expect(homeChannelColumn(attachmentsTable, 'attachment').name).toBe(entityIdColumnName(parent));
  });
});
