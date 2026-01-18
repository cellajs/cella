/** Domain from API response */
export type Domain = {
  id: string;
  fqdn: string;
  type: DomainType;
  verificationStatus: VerificationStatus;
  verificationToken: string | null;
  verificationMethod: 'cname' | 'txt' | null;
  sslStatus: SslStatus;
  scalewayPipelineId: string | null;
  scalewayDnsStageId: string | null;
  repositoryId: string;
  createdAt: string;
  modifiedAt: string | null;
};

/** Domain in list response */
export type DomainListItem = Domain;

/** DNS instructions for domain setup */
export type DnsInstructions = {
  domainId: string;
  fqdn: string;
  type: DomainType;
  records: DnsRecord[];
};

/** DNS record for instructions */
export type DnsRecord = {
  type: 'A' | 'AAAA' | 'CNAME' | 'TXT';
  name: string;
  value: string;
  ttl?: number;
};

/** Domain verification result */
export type VerificationResult = {
  domainId: string;
  verified: boolean;
  errors?: string[];
};

/** Domain verification status values */
export type VerificationStatus = 'pending' | 'verified' | 'failed';

/** SSL status values */
export type SslStatus = 'pending' | 'provisioning' | 'active' | 'error';

/** Domain type values */
export type DomainType = 'subdomain' | 'apex';
