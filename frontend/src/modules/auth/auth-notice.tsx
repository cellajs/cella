import { Link, useRouterState } from '@tanstack/react-router';
import { MessageCircleQuestion } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ApiError } from '~/lib/api';
import { Button, buttonVariants } from '~/modules/ui/button';
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '~/modules/ui/card';
import { getErrorText, getErrorTitle, handleAskForHelp } from '../common/error-notice';

const AuthNotice = ({ error }: { error: ApiError }) => {
  const { t } = useTranslation();
  const { location } = useRouterState();
  const { error: errorFromQuery, severity: severityFromQuery } = location.search;

  const severity = error && 'status' in error ? error.severity : severityFromQuery;

  return (
    <Card className="bg-transparent border-0">
      <CardHeader className="text-center p-0">
        <CardTitle className="text-2xl mb-4">{getErrorTitle(t, error, errorFromQuery) || t('error:error')}</CardTitle>
        <CardDescription className="text-base">
          <span>{getErrorText(t, error, errorFromQuery) || t('error:reported_try_or_contact')}</span>
          <span className="ml-1">{severity === 'warn' && t('error:contact_mistake')}</span>
          <span className="ml-1">{severity === 'error' && t('error:try_again_later')}</span>
        </CardDescription>
      </CardHeader>
      <CardFooter className="flex gap-2 mt-8 justify-center">
        <Link to="/auth/authenticate" className={buttonVariants({ size: 'lg' })}>
          {t('common:sign_in')}
        </Link>
        {severity && ['warn', 'error'].includes(severity) && (
          <Button variant="plain" onClick={handleAskForHelp} size="lg">
            <MessageCircleQuestion size={16} className="mr-1" />
            {t('common:ask_for_help')}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
};

export default AuthNotice;
