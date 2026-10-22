import { BuildingIcon } from 'lucide-react';
import { appConfig } from 'shared';
import { cn } from '~/utils/cn';

/** The support address as a mail link. */
export function SupportEmailLink({ className }: { className?: string }) {
  const { supportEmail } = appConfig.company;

  return (
    <a className={className} href={`mailto:${supportEmail}`} target="_blank" rel="noreferrer">
      {supportEmail}
    </a>
  );
}

export function LegalContact({ addressOnly = false, className }: { addressOnly?: boolean; className?: string }) {
  const companyFull = appConfig.company.name;
  const streetAddress = appConfig.company.streetAddress;
  const postcode = appConfig.company.postcode;
  const city = appConfig.company.city;
  const country = appConfig.company.country;
  const registration = appConfig.company.registration;
  const vatNumber = appConfig.company.vatNumber;

  return (
    <div className={cn('not-prose flex', className)}>
      <span className="mr-6 flex flex-col items-center">
        <BuildingIcon className="mt-1 shrink-0" />
        <span className="mt-1 w-px grow bg-border" />
      </span>
      <ul>
        <li className="mb-2">
          <strong>{companyFull}</strong>
        </li>
        <li>{streetAddress}</li>
        <li>
          {city}, {postcode}
        </li>
        <li>{country}</li>
        <li>
          <SupportEmailLink className="link-inline" />
        </li>
        {!addressOnly && <li>{registration}</li>}
        {!addressOnly && vatNumber && <li>VAT number: {vatNumber}</li>}
      </ul>
    </div>
  );
}
