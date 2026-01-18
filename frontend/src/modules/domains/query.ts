import { queryOptions } from '@tanstack/react-query';
import { addDomain, getDnsInstructions, getDomain, listDomains, removeDomain, verifyDomain } from '~/api.gen';
import type { VerificationStatus } from './types';

/** Query keys for domains */
export const domainsKeys = {
  all: ['domains'] as const,
  list: (params?: { repositoryId?: string; verificationStatus?: VerificationStatus }) =>
    [...domainsKeys.all, 'list', params] as const,
  detail: (domainId: string) => [...domainsKeys.all, 'detail', domainId] as const,
  dnsInstructions: (domainId: string) => [...domainsKeys.all, 'dns', domainId] as const,
};

/** Query options for listing domains */
export const domainsListOptions = (params?: {
  repositoryId?: string;
  verificationStatus?: VerificationStatus;
  limit?: number;
  offset?: number;
}) =>
  queryOptions({
    queryKey: domainsKeys.list({ repositoryId: params?.repositoryId, verificationStatus: params?.verificationStatus }),
    queryFn: () =>
      listDomains({
        query: {
          repositoryId: params?.repositoryId,
          verificationStatus: params?.verificationStatus,
          limit: params?.limit?.toString(),
          offset: params?.offset?.toString(),
        },
      }),
  });

/** Query options for fetching a single domain */
export const domainOptions = (domainId: string) =>
  queryOptions({
    queryKey: domainsKeys.detail(domainId),
    queryFn: () =>
      getDomain({
        path: { domainId },
      }),
  });

/** Query options for fetching DNS instructions */
export const dnsInstructionsOptions = (domainId: string) =>
  queryOptions({
    queryKey: domainsKeys.dnsInstructions(domainId),
    queryFn: () =>
      getDnsInstructions({
        path: { domainId },
      }),
  });

/** Add a new domain */
export const addDomainMutation = (fqdn: string, repositoryId: string) =>
  addDomain({
    body: { fqdn, repositoryId },
  });

/** Verify domain DNS configuration */
export const verifyDomainMutation = (domainId: string) =>
  verifyDomain({
    path: { domainId },
  });

/** Remove a domain */
export const removeDomainMutation = (domainId: string) =>
  removeDomain({
    path: { domainId },
  });
