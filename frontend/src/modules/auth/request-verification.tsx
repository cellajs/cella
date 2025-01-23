import { useTranslation } from 'react-i18next';

const RequestVerification = () => {
  const { t } = useTranslation();
  return (
    <div className="text-center">
      <h1 className="text-2xl">{t('common:almost_there')}</h1>
      <p className="font-light mt-4">{t('common:request_verification.text')}</p>
    </div>
  );
};

export default RequestVerification;
