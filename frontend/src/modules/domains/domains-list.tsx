import { useSuspenseQuery } from '@tanstack/react-query';
import {
  AlertCircleIcon,
  CheckCircleIcon,
  ClockIcon,
  CopyIcon,
  GlobeIcon,
  ShieldCheckIcon,
  Trash2Icon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/modules/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/modules/ui/table';
import { domainsListOptions, removeDomainMutation, verifyDomainMutation } from './query';
import type { DomainListItem, SslStatus, VerificationStatus } from './types';

interface DomainsListProps {
  repositoryId?: string;
}

/**
 * Displays a list of custom domains with verification status.
 */
export function DomainsList({ repositoryId }: DomainsListProps) {
  const { t } = useTranslation();
  const { data } = useSuspenseQuery(domainsListOptions({ repositoryId }));

  if (!data || data.items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('common:no_results')}</CardTitle>
          <CardDescription>{t('common:no_custom_domains')}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('common:custom_domains')}</CardTitle>
        <CardDescription>{t('common:showing_count', { count: data.items.length, total: data.total })}</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('common:domain')}</TableHead>
              <TableHead>{t('common:type')}</TableHead>
              <TableHead>{t('common:verification')}</TableHead>
              <TableHead>{t('common:ssl')}</TableHead>
              <TableHead className="text-right">{t('common:actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((domain) => (
              <DomainRow key={domain.id} domain={domain} />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

interface DomainRowProps {
  domain: DomainListItem;
}

/** Individual domain row with status and actions */
function DomainRow({ domain }: DomainRowProps) {
  const { t } = useTranslation();

  const handleVerify = async () => {
    try {
      await verifyDomainMutation(domain.id);
    } catch (error) {
      console.error('Verification failed:', error);
    }
  };

  const handleRemove = async () => {
    try {
      await removeDomainMutation(domain.id);
    } catch (error) {
      console.error('Remove failed:', error);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2">
          <GlobeIcon className="h-4 w-4 text-muted-foreground" />
          <span className="font-mono text-sm">{domain.fqdn}</span>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="outline">{domain.type}</Badge>
      </TableCell>
      <TableCell>
        <VerificationBadge status={domain.verificationStatus} />
      </TableCell>
      <TableCell>
        <SslBadge status={domain.sslStatus} />
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          {domain.verificationStatus === 'pending' && domain.verificationToken && (
            <Button variant="outline" size="sm" onClick={() => copyToClipboard(domain.verificationToken!)}>
              <CopyIcon className="h-3 w-3 mr-1" />
              {t('common:copy_token')}
            </Button>
          )}
          {domain.verificationStatus === 'pending' && (
            <Button variant="outline" size="sm" onClick={handleVerify}>
              <CheckCircleIcon className="h-3 w-3 mr-1" />
              {t('common:verify')}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={handleRemove}>
            <Trash2Icon className="h-3 w-3" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

interface VerificationBadgeProps {
  status: VerificationStatus;
}

/** Verification status badge */
function VerificationBadge({ status }: VerificationBadgeProps) {
  switch (status) {
    case 'verified':
      return (
        <Badge variant="default" className="gap-1">
          <CheckCircleIcon className="h-3 w-3" />
          verified
        </Badge>
      );
    case 'failed':
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertCircleIcon className="h-3 w-3" />
          failed
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary" className="gap-1">
          <ClockIcon className="h-3 w-3" />
          pending
        </Badge>
      );
  }
}

interface SslBadgeProps {
  status: SslStatus;
}

/** SSL status badge */
function SslBadge({ status }: SslBadgeProps) {
  switch (status) {
    case 'active':
      return (
        <Badge variant="default" className="gap-1">
          <ShieldCheckIcon className="h-3 w-3" />
          active
        </Badge>
      );
    case 'error':
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertCircleIcon className="h-3 w-3" />
          error
        </Badge>
      );
    case 'provisioning':
      return (
        <Badge variant="secondary" className="gap-1">
          <ClockIcon className="h-3 w-3" />
          provisioning
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="gap-1">
          <ClockIcon className="h-3 w-3" />
          pending
        </Badge>
      );
  }
}
