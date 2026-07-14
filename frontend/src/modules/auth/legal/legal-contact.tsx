import { BuildingIcon } from 'lucide-react';
import { appConfig } from 'shared';
import { cn } from '~/utils/cn';

/** Component to display the legal contact information of the company */
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
    <div className={cn('flex', className)}>
      <span className="mr-6 flex flex-col items-center">
        <BuildingIcon className="mt-1 shrink-0" />
        <span className="mt-1 w-px grow bg-border" />
      </span>
      <ul className="m-0! list-none pl-0">
        <li className="mt-0! mb-2">
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
    </div>
  );
}
