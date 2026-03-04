import { BuildingIcon } from 'lucide-react';
import { appConfig } from 'shared';

export function LegalContact({ addressOnly = false }: { addressOnly?: boolean }) {
  const companyFull = appConfig.company.name;
  const streetAddress = appConfig.company.streetAddress;
  const postcode = appConfig.company.postcode;
  const city = appConfig.company.city;
  const country = appConfig.company.country;
  const supportEmail = appConfig.company.supportEmail;
  const registration = appConfig.company.registration;
  const bankAccount = appConfig.company.bankAccount;

  return (
    <div className="mt-8 mb-8 flex text-sm">
      <div className="flex flex-col items-center mr-3">
        <BuildingIcon size={16} className="shrink-0 mt-0.5" />
        <div className="w-px grow bg-border mt-1" />
      </div>
      <ul className="list-none pl-0">
        <li>
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
