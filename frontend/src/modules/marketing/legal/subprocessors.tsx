import subprocessors from '#json/subprocessors.json';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/modules/ui/table';

function Subprocessors() {
  return (
    <Table title="Subprocessors" className="mt-2">
      <TableHeader>
        <TableRow>
          <TableHead>Company</TableHead>
          <TableHead>Country</TableHead>
          <TableHead>Services</TableHead>
          <TableHead>Categories</TableHead>
          <TableHead>Affected</TableHead>
          <TableHead>Risk</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {subprocessors.map((subprocessor) => (
          <TableRow key={subprocessor.slug}>
            <TableCell>
              <a href={subprocessor.website} target="_blank">
                {subprocessor.legalName}
              </a>
            </TableCell>
            <TableCell>{subprocessor.country}</TableCell>
            <TableCell className="whitespace-normal">{subprocessor.servicesProvided}</TableCell>
            <TableCell className="whitespace-normal">{subprocessor.categoriesOfPersonalData.join(', ')}</TableCell>
            <TableCell className="whitespace-normal">{subprocessor.dataSubjects.join(', ')}</TableCell>
            <TableCell>{subprocessor.riskRating}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default Subprocessors;
