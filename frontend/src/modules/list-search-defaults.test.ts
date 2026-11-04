import { describe, expect, it } from 'vitest';
import { attachmentsRouteSearchParamsSchema, attachmentsSearchDefaults } from '~/modules/attachment/search-params-schemas';
import { operationsTableRouteSearchParamsSchema } from '~/modules/docs/search-params-schemas';
import { membersRouteSearchParamsSchema, membersSearchDefaults } from '~/modules/memberships/search-params-schemas';
import { organizationsRouteSearchParamsSchema, organizationsTableSearchDefaults } from '~/modules/organization/search-params-schemas';
import { requestsRouteSearchParamsSchema, requestsSearchDefaults } from '~/modules/requests/search-params-schemas';
import { tenantsRouteSearchParamsSchema, tenantsSearchDefaults } from '~/modules/tenants/search-params-schemas';
import { usersRouteSearchParamsSchema, usersSearchDefaults } from '~/modules/user/search-params-schemas';

type Parse = (search: Record<string, unknown>) => Record<string, unknown>;

const cases: Array<{ name: string; parse: Parse; defaults: Record<string, unknown>; filters?: string[] }> = [
  { name: 'attachments', parse: (search) => attachmentsRouteSearchParamsSchema.parse(search), defaults: attachmentsSearchDefaults },
  { name: 'members', parse: (search) => membersRouteSearchParamsSchema.parse(search), defaults: membersSearchDefaults, filters: ['role'] },
  { name: 'organizations', parse: (search) => organizationsRouteSearchParamsSchema.parse(search), defaults: organizationsTableSearchDefaults },
  { name: 'requests', parse: (search) => requestsRouteSearchParamsSchema.parse(search), defaults: requestsSearchDefaults },
  { name: 'tenants', parse: (search) => tenantsRouteSearchParamsSchema.parse(search), defaults: tenantsSearchDefaults, filters: ['status'] },
  { name: 'users', parse: (search) => usersRouteSearchParamsSchema.parse(search), defaults: usersSearchDefaults, filters: ['role'] },
];

describe('list search defaults', () => {
  // An old bookmark can name a sort column or filter value that no longer exists: the list opens on its defaults.
  // A stripped URL restores the view's own default, which can differ from the API's.
  it.each(cases)('$name reads an absent sort and order as its default', ({ parse, defaults }) => {
    expect(parse({})).toMatchObject({ sort: defaults.sort, order: defaults.order });
  });

  it.each(cases)('$name reads an unknown sort, order or filter as its default', ({ parse, defaults, filters = [] }) => {
    const unknownFilters = Object.fromEntries(filters.map((filter) => [filter, 'bogus']));
    const fromSchema = parse({ sort: 'bogus', order: 'bogus', ...unknownFilters });
    expect(fromSchema).toMatchObject({ sort: defaults.sort, order: defaults.order });
    for (const filter of filters) expect(fromSchema[filter]).toBeUndefined();
  });

  it('the docs operations table reads an unknown order as none', () => {
    expect(operationsTableRouteSearchParamsSchema.parse({ order: 'bogus' }).order).toBeUndefined();
  });
});
