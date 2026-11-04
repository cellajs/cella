import { zGetOrganizationsQuery } from 'sdk/zod.gen';
import { listSearchDefaults, listSearchSchema } from '~/modules/common/search-params-schemas';

/** The API's default: the caller's menu order. */
export const organizationsSearchDefaults = listSearchDefaults(zGetOrganizationsQuery);

/** The system table lists organizations the admin is no member of, which have no menu order: it opens newest first. */
export const organizationsTableSearchDefaults = { ...organizationsSearchDefaults, sort: 'createdAt', order: 'desc' } as const;

export const organizationsRouteSearchParamsSchema = listSearchSchema(zGetOrganizationsQuery, organizationsTableSearchDefaults);
