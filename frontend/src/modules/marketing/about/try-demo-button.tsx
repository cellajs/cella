import { useTranslation } from 'react-i18next';
import { useCreateDemoMutation } from '~/modules/tenants/query';
import { Button } from '~/modules/ui/button';

/** Takes a demo and opens it; the mutation's error toasts through the global handler. */
export function TryDemoButton({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { mutate, isPending } = useCreateDemoMutation();

  return (
    <Button size="xl" loading={isPending} onClick={() => mutate()} className={className}>
      {t('c:try_demo')}
    </Button>
  );
}
