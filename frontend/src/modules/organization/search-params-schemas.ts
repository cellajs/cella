import { zListOrganizationsQuery } from 'sdk/zod.gen';
import { tenantKindValues } from 'shared';
import { z } from 'zod';
import { csvSearchParam, listSearchDefaults, listSearchSchema } from '~/modules/common/search-params-schemas';

/** The API's default: the caller's menu order. */
export const organizationsSearchDefaults = listSearchDefaults(zListOrganizationsQuery);

/** The system table lists organizations the admin is no member of, which have no menu order: it opens newest first. */
export const organizationsTableSearchDefaults = { ...organizationsSearchDefaults, sort: 'createdAt', order: 'desc' } as const;

export const organizationsRouteSearchParamsSchema = listSearchSchema(zListOrganizationsQuery, organizationsTableSearchDefaults).extend({
  /** The tenant kinds the system table covers; empty covers the kinds the app lists by default. */
  kind: csvSearchParam(z.enum(tenantKindValues)),
});
