import type { EntityHierarchy } from 'shared';
import { deepHierarchy } from 'shared/testing/deep-fixture';
import { wideHierarchy } from 'shared/testing/wide-fixture';
import { describe, expect, it } from 'vitest';
import { channelToolsConfigSchema } from '#/schemas/tools-config';

const takes = (entityType: string, entityHierarchy: EntityHierarchy, slot: string) =>
  channelToolsConfigSchema(entityType, entityHierarchy).safeParse({ [slot]: { order: ['members'], hidden: ['attachments'] } }).success;

// A row stores no arrangement for a channel above it or beside it: that key never reaches its column.
describe('channelToolsConfigSchema', () => {
  it.each([
    ['organization', 'project.tabs', true],
    ['course', 'courseSection.settings', true],
    ['courseSection', 'project.tabs', true],
    ['project', 'project.tabs', true],
    ['project', 'courseSection.tabs', false],
    ['courseSection', 'course.settings', false],
    ['course', 'organization.tabs', false],
  ])('in a chain, a %s row takes %s: %s', (entityType, slot, accepted) => {
    expect(takes(entityType, deepHierarchy, slot)).toBe(accepted);
  });

  it.each([
    ['workspace', 'workspace.tabs', true],
    ['workspace', 'project.tabs', false],
    ['project', 'workspace.settings', false],
  ])('beside a sibling type, a %s row takes %s: %s', (entityType, slot, accepted) => {
    expect(takes(entityType, wideHierarchy, slot)).toBe(accepted);
  });
});
