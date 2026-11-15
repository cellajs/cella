import { useTranslation } from 'react-i18next';
import { useCreateDemoMutation } from '~/modules/tenants/query';
import { Button } from '~/modules/ui/button';
import { useUserStore } from '~/modules/user/user-store';

/** Takes a demo and opens it; the mutation's error toasts through the global handler. A stored user is live, so they are offered none. */
export function TryDemoButton({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { mutate, isPending } = useCreateDemoMutation();
  const signedIn = useUserStore((state) => state.user !== null);
  if (signedIn) return null;

  return (
    <Button size="xl" loading={isPending} onClick={() => mutate()} className={className}>
      {t('c:try_demo')}
    </Button>
  );
}
