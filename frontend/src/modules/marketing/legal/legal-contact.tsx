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
    <ul className="mt-8 mb-8 italic list-none">
      <li>
        <strong>{companyFull}</strong>
      </li>
      <li>{streetAddress}</li>
      <li>
        {city}, {postcode}
      </li>
      <li>{country}</li>
      <li>
        <a className="ml-1 underline" href={`mailto:${supportEmail}`} target="_blank" rel="noreferrer">
          {supportEmail}
        </a>
      </li>
      {!addressOnly && <li>{registration}</li>}
      {!addressOnly && <li>Bank account: {bankAccount}</li>}
    </ul>
  );
}
