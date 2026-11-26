import { type Attributes, trace } from '@opentelemetry/api';
import type { Env } from '#/core/context';

type Variables = Env['Variables'];

/** The request variables the guards set of who a request acts as and where; a guard that never ran leaves its field unset. */
interface RequestScope {
  tenant?: Pick<Variables['tenant'], 'id' | 'name' | 'kind'>;
  organization?: Pick<Variables['organization'], 'id' | 'name'>;
  user?: Pick<Variables['user'], 'id'>;
}

/**
 * Who a request acts as and where, as its span's attributes, for a monitor's usage per organization and users-affected
 * counts. The user is its opaque id alone; a field no guard set adds no attribute.
 */
export const requestSpanAttributes = ({ tenant, organization, user }: RequestScope): Attributes => ({
  ...(tenant && { 'tenant.id': tenant.id, 'tenant.name': tenant.name, 'tenant.kind': tenant.kind }),
  ...(organization && { 'organization.id': organization.id, 'organization.name': organization.name }),
  ...(user && { 'user.id': user.id }),
});

/** Sets attributes on the active span, which inside the tracing middleware's `next` is the request's server span. */
export const setRequestSpanAttributes = (attributes: Attributes): void => {
  trace.getActiveSpan()?.setAttributes(attributes);
};
