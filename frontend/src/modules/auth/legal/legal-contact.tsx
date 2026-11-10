import { BuildingIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { cn } from '~/utils/cn';
import { regionName } from '~/utils/region-name';

export function SupportEmailLink({ className }: { className?: string }) {
  const { supportEmail } = appConfig;

  return (
    <a className={className} href={`mailto:${supportEmail}`} target="_blank" rel="noreferrer">
      {supportEmail}
    </a>
  );
}

export function LegalContact({ className }: { className?: string }) {
  const { i18n } = useTranslation();
  const { name, address, registration, vatNumber } = appConfig.company;

  return (
    <div className={cn('not-prose flex gap-6', className)}>
      <span className="flex flex-col items-center">
        <BuildingIcon className="mt-1" />
        <span className="bg-border mt-1 w-px grow" />
      </span>
      <ul>
        <li className="mb-2">
          <strong>{name}</strong>
        </li>
        {address && (
          <>
            <li>{address.streetAddress}</li>
            <li>
              {address.city}, {address.postalCode}
            </li>
            <li>{regionName(address.regionCode, i18n.language)}</li>
          </>
        )}
        <li>
          <SupportEmailLink className="link-inline" />
        </li>
        {registration && <li>{registration}</li>}
        {vatNumber && <li>VAT number: {vatNumber}</li>}
      </ul>
    </div>
  );
}
