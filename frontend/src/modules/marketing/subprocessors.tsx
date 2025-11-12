import type subprocessors from '#json/subprocessors.json';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/modules/ui/table';

type _Subprocessors = typeof subprocessors;

const Subprocessors = ({ subprocessors }: { subprocessors: _Subprocessors }) => {
  return (
    <Table title="Subprocessors" className="mt-2">
      <TableHeader>
        <TableRow>
          <TableHead>Company</TableHead>
          <TableHead>Country</TableHead>
          <TableHead>Services</TableHead>
          {/* <TableHead>Processing</TableHead> */}
          <TableHead>Categories</TableHead>
          <TableHead>Affected</TableHead>
          {/* <TableHead>Purposes</TableHead> */}
          <TableHead>Risk</TableHead>
          {/* <TableHead>DPA Effective</TableHead> */}
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
            {/* <TableCell>
            {subprocessor.processingActivities}
          </TableCell> */}
            <TableCell className="whitespace-normal">{subprocessor.categoriesOfPersonalData.join(', ')}</TableCell>
            <TableCell className="whitespace-normal">{subprocessor.dataSubjects.join(', ')}</TableCell>
            {/* <TableCell>
            {subprocessor.purposes}
          </TableCell> */}
            <TableCell>{subprocessor.riskRating}</TableCell>
            {/* <TableCell>
            subprocessor.dpa.signed
            {subprocessor.dpa.effectiveDate}
            subprocessor.dpa.url
          </TableCell> */}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

export default Subprocessors;
