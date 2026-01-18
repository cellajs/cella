import { useSuspenseQuery } from '@tanstack/react-query';
import { AlertCircleIcon, CheckCircleIcon, ClockIcon, LoaderIcon, RotateCcwIcon, XCircleIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/modules/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/modules/ui/table';
import { dateShort } from '~/utils/date-short';
import { deploymentsListOptions, rollbackDeploymentMutation } from './query';
import type { DeploymentListItem, DeploymentStatus } from './types';

interface DeploymentsListProps {
  repositoryId?: string;
}

/**
 * Displays a list of deployments with status and actions.
 */
export function DeploymentsList({ repositoryId }: DeploymentsListProps) {
  const { t } = useTranslation();
  const { data } = useSuspenseQuery(deploymentsListOptions({ repositoryId }));

  if (!data || data.items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('common:no_results')}</CardTitle>
          <CardDescription>{t('common:no_deployments_yet')}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('common:deployments')}</CardTitle>
        <CardDescription>{t('common:showing_count', { count: data.items.length, total: data.total })}</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('common:status')}</TableHead>
              <TableHead>{t('common:branch')}</TableHead>
              <TableHead>{t('common:commit')}</TableHead>
              <TableHead>{t('common:created')}</TableHead>
              <TableHead className="text-right">{t('common:actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((deployment) => (
              <DeploymentRow key={deployment.id} deployment={deployment} repositoryId={repositoryId} />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

interface DeploymentRowProps {
  deployment: DeploymentListItem;
  repositoryId?: string;
}

/** Individual deployment row with status and actions */
function DeploymentRow({ deployment, repositoryId }: DeploymentRowProps) {
  const { t } = useTranslation();

  const handleRollback = async () => {
    if (!repositoryId) return;
    try {
      await rollbackDeploymentMutation(repositoryId, deployment.id);
    } catch (error) {
      console.error('Rollback failed:', error);
    }
  };

  return (
    <TableRow>
      <TableCell>
        <StatusBadge status={deployment.status} isActive={deployment.isActive} />
      </TableCell>
      <TableCell className="font-mono text-sm">{deployment.branch}</TableCell>
      <TableCell className="font-mono text-sm">{deployment.commitSha?.slice(0, 7) || '—'}</TableCell>
      <TableCell className="text-muted-foreground">{dateShort(deployment.createdAt)}</TableCell>
      <TableCell className="text-right">
        {deployment.status === 'deployed' && !deployment.isActive && repositoryId && (
          <Button variant="outline" size="sm" onClick={handleRollback}>
            <RotateCcwIcon className="h-3 w-3 mr-1" />
            {t('common:rollback')}
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

interface StatusBadgeProps {
  status: DeploymentStatus;
  isActive: boolean;
}

/** Status badge with icon and color */
function StatusBadge({ status, isActive }: StatusBadgeProps) {
  const Icon = getStatusIcon(status);
  const variant = getStatusVariant(status);

  return (
    <Badge variant={variant} className="gap-1">
      <Icon className="h-3 w-3" />
      {status}
      {isActive && ' (active)'}
    </Badge>
  );
}

/** Get icon based on deployment status */
function getStatusIcon(status: DeploymentStatus) {
  switch (status) {
    case 'deployed':
      return CheckCircleIcon;
    case 'failed':
      return XCircleIcon;
    case 'rolled_back':
      return AlertCircleIcon;
    case 'pending':
      return ClockIcon;
    default:
      return LoaderIcon;
  }
}

/** Get badge variant based on deployment status */
function getStatusVariant(status: DeploymentStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'deployed':
      return 'default';
    case 'pending':
    case 'downloading':
    case 'uploading':
    case 'deploying':
      return 'secondary';
    case 'failed':
      return 'destructive';
    default:
      return 'outline';
  }
}
