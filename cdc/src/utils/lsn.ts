/** Parses a pg_lsn such as '16/B374D848' into its byte position. */
export const lsnToBigInt = (lsn: string): bigint => {
  const [high = '0', low = '0'] = lsn.split('/');
  return (BigInt(`0x${high}`) << 32n) | BigInt(`0x${low}`);
};

export const formatLsn = (position: bigint): string =>
  `${(position >> 32n).toString(16).toUpperCase()}/${(position & 0xffffffffn).toString(16).toUpperCase()}`;
