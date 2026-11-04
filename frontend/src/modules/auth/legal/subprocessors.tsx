import { subprocessors } from '~/modules/auth/legal/legal-config';
import { LegalFieldCell } from '~/modules/auth/legal/legal-field-cell';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/modules/ui/table';

export function Subprocessors() {
  return (
    <Table title="Subprocessors" role="table" className="mt-2 max-sm:block">
      <TableHeader role="rowgroup" className="max-sm:sr-only">
        <TableRow role="row">
          <TableHead role="columnheader">Company</TableHead>
          <TableHead role="columnheader">Country</TableHead>
          <TableHead role="columnheader">Services</TableHead>
          <TableHead role="columnheader">Personal data</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody role="rowgroup" className="max-sm:block">
        {subprocessors.map(({ slug, name, legalName, website, country, servicesProvided, categoriesOfPersonalData }) => (
          <TableRow key={slug} role="row" className="max-sm:flex max-sm:flex-wrap max-sm:justify-between max-sm:gap-x-3 max-sm:py-3.5">
            <TableCell role="cell" className="max-sm:p-0">
              <a href={website} target="_blank" rel="noreferrer">
                {legalName.includes(name) ? legalName : `${name} (${legalName})`}
              </a>
            </TableCell>
            <TableCell role="cell" className="max-sm:text-muted-foreground whitespace-normal max-sm:p-0">
              {country}
            </TableCell>
            <LegalFieldCell label="Services" className="max-sm:w-full">
              {servicesProvided.join(', ')}
            </LegalFieldCell>
            <LegalFieldCell label="Personal data" className="max-sm:w-full">
              {categoriesOfPersonalData.join(', ')}
            </LegalFieldCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
