import { describe, expect, it } from 'vitest';
import {
  attachmentsRouteSearchParamsSchema,
  attachmentsSearchDefaults,
} from '~/modules/attachment/search-params-schemas';
import { membersRouteSearchParamsSchema, membersSearchDefaults } from '~/modules/memberships/search-params-schemas';
import {
  organizationsRouteSearchParamsSchema,
  organizationsSearchDefaults,
} from '~/modules/organization/search-params-schemas';
import { requestsRouteSearchParamsSchema, requestsSearchDefaults } from '~/modules/requests/search-params-schemas';
import { tenantsRouteSearchParamsSchemas, tenantsSearchDefaults } from '~/modules/tenants/search-params-schemas';
import { usersRouteSearchParamsSchema, usersSearchDefaults } from '~/modules/user/search-params-schemas';

/** Ensure URL-stripping defaults stay aligned with regenerated schemas that restore them on read. */
const cases: Array<{ name: string; parse: () => Record<string, unknown>; defaults: Record<string, unknown> }> = [
  {
    name: 'attachments',
    parse: () => attachmentsRouteSearchParamsSchema.parse({}),
    defaults: attachmentsSearchDefaults,
  },
  { name: 'members', parse: () => membersRouteSearchParamsSchema.parse({}), defaults: membersSearchDefaults },
  {
    name: 'organizations',
    parse: () => organizationsRouteSearchParamsSchema.parse({}),
    defaults: organizationsSearchDefaults,
  },
  { name: 'requests', parse: () => requestsRouteSearchParamsSchema.parse({}), defaults: requestsSearchDefaults },
  { name: 'tenants', parse: () => tenantsRouteSearchParamsSchemas.parse({}), defaults: tenantsSearchDefaults },
  { name: 'users', parse: () => usersRouteSearchParamsSchema.parse({}), defaults: usersSearchDefaults },
];

describe('list search defaults', () => {
  it.each(cases)('$name sort and order match the schema defaults', ({ parse, defaults }) => {
    const fromSchema = parse();
    expect(defaults.sort).toBe(fromSchema.sort);
    expect(defaults.order).toBe(fromSchema.order);
  });

  // q has no schema default, so absence parses to undefined. '' is what a cleared search box
  // produces, and stripping it is what keeps `?q=` out of the URL.
  it.each(cases)('$name strips a cleared q', ({ parse, defaults }) => {
    expect(defaults.q).toBe('');
    expect(parse().q).toBeUndefined();
  });
});
