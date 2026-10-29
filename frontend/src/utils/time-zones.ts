import countries from '#json/countries.json';
import { regionName } from '~/utils/region-name';

export interface TimeZoneEntry {
  /** IANA id, the value a form stores. */
  zone: string;
  /** ISO 3166-1 alpha-2 code; null for UTC. */
  country: string | null;
  countryName: string;
  /** The id's last segment, such as `Buenos Aires`: tzdata names cities in English only. */
  city: string;
  /** Offset from UTC today, in minutes. */
  offsetMinutes: number;
  /** Such as `GMT+5:30`. */
  offsetLabel: string;
  /** Such as `Central European Time`, in the table's language. */
  genericName: string;
}

const countryZones = new Map(countries.map(({ code, timezones }) => [code, timezones]));

// A zone two countries share, such as Europe/Belgrade, is listed under the first by code
const zoneCountries = new Map<string, string>();
for (const { code, timezones } of countries) {
  for (const zone of timezones) if (!zoneCountries.has(zone)) zoneCountries.set(zone, code);
}

const zoneName = (zone: string, language: string, style: Intl.DateTimeFormatOptions['timeZoneName']) =>
  new Intl.DateTimeFormat(language, { timeZone: zone, timeZoneName: style }).formatToParts().find((part) => part.type === 'timeZoneName')?.value ??
  '';

const offsetMinutes = (zone: string) => {
  const match = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(zoneName(zone, 'en-US', 'shortOffset'));
  if (!match) return 0;
  const [, sign, hours, minutes = '0'] = match;
  return (sign === '-' ? -1 : 1) * (Number(hours) * 60 + Number(minutes));
};

const offsetLabel = (minutes: number) => {
  const abs = Math.abs(minutes);
  const rest = abs % 60 ? `:${String(abs % 60).padStart(2, '0')}` : '';
  return `GMT${minutes < 0 ? '-' : '+'}${Math.floor(abs / 60)}${rest}`;
};

const tables = new Map<string, Map<string, TimeZoneEntry>>();

const entriesByZone = (language: string) => {
  const cached = tables.get(language);
  if (cached) return cached;

  const entries: TimeZoneEntry[] = [...zoneCountries].map(([zone, country]) => {
    const minutes = offsetMinutes(zone);
    return {
      zone,
      country,
      countryName: regionName(country, language),
      city: zone.slice(zone.lastIndexOf('/') + 1).replaceAll('_', ' '),
      offsetMinutes: minutes,
      offsetLabel: offsetLabel(minutes),
      genericName: zoneName(zone, language, 'longGeneric'),
    };
  });
  // CLDR has no generic name for UTC, only its long one
  entries.push({
    zone: 'UTC',
    country: null,
    countryName: '',
    city: 'UTC',
    offsetMinutes: 0,
    offsetLabel: offsetLabel(0),
    genericName: zoneName('UTC', language, 'long'),
  });
  entries.sort((a, b) => a.offsetMinutes - b.offsetMinutes || a.city.localeCompare(b.city, language));

  const table = new Map(entries.map((entry) => [entry.zone, entry]));
  tables.set(language, table);
  return table;
};

/** Every zone `countries.json` lists plus UTC, sorted by today's offset, then city. Built once per language. */
export const timeZoneTable = (language: string) => [...entriesByZone(language).values()];

/** A country's zones in `countries.json` order, the first per zone name: the 29 zones of the United States make eight rows. */
export const countryTimeZones = (country: string, language: string) => {
  const table = entriesByZone(language);
  const names = new Set<string>();
  return (countryZones.get(country) ?? []).flatMap((zone) => {
    const entry = table.get(zone);
    if (!entry || names.has(entry.genericName)) return [];
    names.add(entry.genericName);
    return [entry];
  });
};

/** The zone a country with a single zone name fills in, such as Europe/Berlin for Germany. */
export const soleTimeZone = (country: string, language: string) => {
  const zones = countryTimeZones(country, language);
  return zones.length === 1 ? zones[0].zone : undefined;
};

/** The device's zone as `countries.json` spells it: an older ICU answers Europe/Kiev for Europe/Kyiv. */
export const deviceTimeZone = () => {
  const device = new Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (device === 'UTC' || zoneCountries.has(device)) return device;
  for (const zone of zoneCountries.keys()) {
    if (new Intl.DateTimeFormat('en-US', { timeZone: zone }).resolvedOptions().timeZone === device) return zone;
  }
};

/** The country the device's zone belongs to; undefined for UTC or an unknown zone. */
export const deviceCountry = () => {
  const zone = deviceTimeZone();
  return zone ? zoneCountries.get(zone) : undefined;
};
