import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { toaster } from '~/modules/common/toaster/toaster';
import { useDomainCreateMutation } from '~/modules/tenants/query';
import { Button } from '~/modules/ui/button';
import { Input } from '~/modules/ui/input';

export const createDomainDialogId = 'create-domain';

export function CreateDomainForm({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation();
  const [newDomain, setNewDomain] = useState('');
  const createMutation = useDomainCreateMutation();

  const handleAdd = () => {
    const domain = newDomain.trim().toLowerCase();
    if (!domain) return;

    createMutation.mutate(
      { path: { tenantId }, body: { domain } },
      {
        onSuccess: () => {
          setNewDomain('');
          toaster.success(t('c:success.create_resource', { resource: t('c:domain') }));
          useDialoger.getState().remove(createDomainDialogId);
        },
      },
    );
  };

  return (
    <div className="flex gap-2">
      <Input
        autoFocus
        value={newDomain}
        onChange={(e) => setNewDomain(e.target.value)}
        placeholder="example.com"
        onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
      />
      <Button onClick={handleAdd} loading={createMutation.isPending} disabled={!newDomain.trim()}>
        {t('c:create')}
      </Button>
    </div>
  );
}
