type LegalContactProps = {
  companyFull: string;
  streetAddress: string;
  city: string;
  postcode: string;
  country: string;
  supportEmail: string;
  registration: string;
  bankAccount: string;
};

const LegalContact = ({ companyFull, streetAddress, city, postcode, country, supportEmail, registration, bankAccount }: LegalContactProps) => {
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
        <a className="ml-1" href={`mailto:${supportEmail}`} target="_blank" rel="noreferrer">
          {supportEmail}
        </a>
      </li>
      <li>{registration}</li>
      <li>Bank account: {bankAccount}</li>
    </ul>
  );
};

export default LegalContact;
