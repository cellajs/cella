import { existsSync } from 'node:fs';
import { type AsnResponse, type CountryResponse, open, type Reader } from 'maxmind';
import { env } from '#/env';
import { baseLog } from '#/lib/pino';

let countryReader: Reader<CountryResponse> | null = null;
let asnReader: Reader<AsnResponse> | null = null;
let countryWarned = false;
let asnWarned = false;

const loadCountry = async (): Promise<Reader<CountryResponse> | null> => {
  if (countryReader) return countryReader;
  if (!existsSync(env.GEOIP_COUNTRY_DB_PATH)) {
    if (!countryWarned) {
      baseLog.warn('GeoIP country database not found — country lookups disabled', {
        path: env.GEOIP_COUNTRY_DB_PATH,
      });
      countryWarned = true;
    }
    return null;
  }
  countryReader = await open<CountryResponse>(env.GEOIP_COUNTRY_DB_PATH);
  return countryReader;
};

const loadAsn = async (): Promise<Reader<AsnResponse> | null> => {
  if (asnReader) return asnReader;
  if (!existsSync(env.GEOIP_ASN_DB_PATH)) {
    if (!asnWarned) {
      baseLog.warn('GeoIP ASN database not found — ASN lookups disabled', { path: env.GEOIP_ASN_DB_PATH });
      asnWarned = true;
    }
    return null;
  }
  asnReader = await open<AsnResponse>(env.GEOIP_ASN_DB_PATH);
  return asnReader;
};

/**
 * Look up the ISO-3166 alpha-2 country code and ASN for an IP address.
 * Both fields are independent: either can be null if the database is missing
 * or the IP is unknown. Never throws; auth/session paths can call this safely.
 *
 * Attribution: IP geolocation by DB-IP (https://db-ip.com), required by CC BY 4.0.
 */
export const lookupIp = async (
  ip: string | null | undefined,
): Promise<{ country: string | null; asn: number | null }> => {
  if (!ip) return { country: null, asn: null };
  try {
    const [country, asn] = await Promise.all([loadCountry(), loadAsn()]);
    return {
      country: country?.get(ip)?.country?.iso_code ?? null,
      asn: asn?.get(ip)?.autonomous_system_number ?? null,
    };
  } catch (err) {
    baseLog.warn('GeoIP lookup failed', { err, ip });
    return { country: null, asn: null };
  }
};
