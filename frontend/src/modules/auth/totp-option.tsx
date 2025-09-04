import { QrCode } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TOPTVerificationForm } from '~/modules/me/totp/verification-form';
import { Button } from '~/modules/ui/button';
import { useUIStore } from '~/store/ui';

export const TOTPOption = () => {
  const { t } = useTranslation();
  const mode = useUIStore((state) => state.mode);

  const [showForm, setShowForm] = useState(false);

  return (
    <div data-mode={mode} className="group flex flex-col space-y-2">
      {showForm ? (
        <TOPTVerificationForm mode="auth" />
      ) : (
        <Button type="button" onClick={() => setShowForm(true)} variant="plain" className="w-full gap-1.5">
          <QrCode size={16} />
          <span>
            {t('common:sign_in')} {t('common:with').toLowerCase()} {t('common:totp').toLowerCase()}
          </span>
        </Button>
      )}
    </div>
  );
};
