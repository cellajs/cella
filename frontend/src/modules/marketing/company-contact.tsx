type CompanyContactProps = {
  companyFull: string;
  streetAddress: string;
  city: string;
  country: string;
  supportEmail: string;
  registration: string;
  bankAccount: string;
};

const CompanyContact = (props: CompanyContactProps) => {
  const { companyFull, streetAddress, city, country, supportEmail, registration, bankAccount } = props;

  return (
    <ul className="mt-8 mb-8 italic list-none">
      <li>
        <strong>{companyFull}</strong>
      </li>
      <li>{streetAddress}</li>
      <li>{city}</li>
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

export default CompanyContact;
