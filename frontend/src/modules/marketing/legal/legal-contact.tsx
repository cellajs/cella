import { BuildingIcon } from 'lucide-react';
import { appConfig } from 'shared';
import { cn } from '~/utils/cn';

export function LegalContact({ addressOnly = false, className }: { addressOnly?: boolean; className?: string }) {
  const companyFull = appConfig.company.name;
  const streetAddress = appConfig.company.streetAddress;
  const postcode = appConfig.company.postcode;
  const city = appConfig.company.city;
  const country = appConfig.company.country;
  const supportEmail = appConfig.company.supportEmail;
  const registration = appConfig.company.registration;
  const bankAccount = appConfig.company.bankAccount;

  return (
    <p className={cn('flex', className)}>
      <span className="flex flex-col items-center mr-3">
        <BuildingIcon size={16} className="shrink-0 mt-1" />
        <span className="w-px grow bg-border mt-1" />
      </span>
      <ul className="list-none m-0! pl-0">
        <li className="mt-0!">
          <strong>{companyFull}</strong>
        </li>
        <li>{streetAddress}</li>
        <li>
          {city}, {postcode}
        </li>
        <li>{country}</li>
        <li>
          <a className="underline" href={`mailto:${supportEmail}`} target="_blank" rel="noreferrer">
            {supportEmail}
          </a>
        </li>
        {!addressOnly && <li>{registration}</li>}
        {!addressOnly && <li>Bank account: {bankAccount}</li>}
      </ul>
    </p>
  );
}
