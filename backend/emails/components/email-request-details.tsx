import type { RequestDetailRow } from '../frame';
import { smallTextStyle } from '../styles';

const labelStyle: React.CSSProperties = { ...smallTextStyle, color: '#666', fontWeight: 600, padding: '0 0.75rem 0 0', verticalAlign: 'top' };
const valueStyle: React.CSSProperties = { ...smallTextStyle, color: '#666', padding: 0 };

/** Country, browser and time of the request that caused the mail, as label and value rows. */
export const EmailRequestDetails = ({ rows }: { rows: RequestDetailRow[] }) => (
  <table role="presentation" cellPadding="0" cellSpacing="0" border={0} className="request-details">
    <tbody>
      {rows.map((row) => (
        <tr key={row.label}>
          <td style={labelStyle}>{row.label}</td>
          <td style={valueStyle}>{row.value}</td>
        </tr>
      ))}
    </tbody>
  </table>
);
