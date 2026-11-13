import { Building2Icon, PlusIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { getMenuSection } from '~/lib/entity-modules';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '~/modules/ui/alert';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

/** The way to start for a user without an organization: a create prompt. Below an invitation it takes the invitation row's weight: answering that comes first, and a new organization may duplicate the team's. */
export function NoOrganizationAlert({ hasInvitations = false }: { hasInvitations?: boolean }) {
  const { t } = useTranslation();
  const createButtonRef = useRef<HTMLButtonElement>(null);
  const createOrganization = getMenuSection('organization')?.createAction;

  if (!createOrganization) return null;

  return (
    // No close button: the way to start stays until an organization exists
    <Alert className={cn('gap-y-1', !hasInvitations && 'p-4')}>
      <Building2Icon />
      <AlertTitle className="line-clamp-none text-balance">{t('c:no_organization_yet')}</AlertTitle>
      <AlertDescription className="text-muted-foreground">
        {t(hasInvitations ? 'c:no_organization_yet.text_invited' : 'c:no_organization_yet.text')}
      </AlertDescription>
      <AlertAction className={cn(!hasInvitations && 'mt-3')}>
        <Button
          ref={createButtonRef}
          variant={hasInvitations ? 'secondary' : 'default'}
          size={hasInvitations ? 'sm' : 'default'}
          className="max-sm:w-full"
          onClick={() => createOrganization(createButtonRef)}
        >
          <PlusIcon />
          {t('c:create_resource', { resource: t('c:organization') })}
        </Button>
      </AlertAction>
    </Alert>
  );
}
