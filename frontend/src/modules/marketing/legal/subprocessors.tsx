import { subprocessors } from '~/modules/marketing/legal/legal-config';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/modules/ui/table';

/**
 * Component to display a list of subprocessors in a table format.
 */
export function Subprocessors() {
  return (
    <Table title="Subprocessors" className="mt-2">
      <TableHeader>
        <TableRow>
          <TableHead>Company</TableHead>
          <TableHead>Country</TableHead>
          <TableHead>Services</TableHead>
          <TableHead>Categories</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {subprocessors.map((subprocessor) => (
          <TableRow key={subprocessor.slug}>
            <TableCell>
              <a href={subprocessor.website} target="_blank" rel="noopener">
                {subprocessor.legalName}
              </a>
            </TableCell>
            <TableCell>{subprocessor.country}</TableCell>
            <TableCell className="whitespace-normal">{subprocessor.servicesProvided.join(', ')}</TableCell>
            <TableCell className="whitespace-normal">{subprocessor.categoriesOfPersonalData.join(', ')}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
