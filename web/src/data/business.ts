// The one source of business facts. Hours here are the Google Business Profile hours.
export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
/** 'HH:MM' 24h, null = closed */
export type DayHours = { opens: string; closes: string } | null;

export const DAY_ORDER: readonly DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const MON_THU: DayHours = { opens: '08:00', closes: '16:00' };

export const BUSINESS = {
  name: 'Noord Karavane',
  schemaType: 'AutoRepair',
  url: 'https://noordkaravane.co.za',
  phone: { e164: '+27833349357', display: '083 334 9357' },
  whatsappNumber: '27833349357',
  address: {
    street: '252 General Beyers Street',
    locality: 'Pretoria North',
    city: 'Pretoria',
    region: 'Gauteng',
    postalCode: '0182',
    country: 'ZA',
  },
  geo: { lat: -25.676593, lng: 28.1774316 },
  links: {
    facebook: 'https://www.facebook.com/NoordKaravane',
    googleProfile: 'https://share.google/T9FFV2QHsZb1VuVMD',
    /** The Google Business Profile's stable Maps URL (cid). Identity for JSON-LD sameAs/hasMap; the share link above is a tracked redirect, kept for visible links. */
    googleMaps: 'https://www.google.com/maps?cid=1109550773885984048',
    kampi: 'https://kampi.co.za',
    mapsQuery: '252+General+Beyers+Street,+Pretoria+North,+Pretoria,+South+Africa',
  },
  google: { rating: 5.0, reviewCount: 24, asOf: '2026-11-07' },
  crossBorder: [
    { code: 'BW', name: 'Botswana' },
    { code: 'MZ', name: 'Mozambique' },
    { code: 'ZW', name: 'Zimbabwe' },
    { code: 'NA', name: 'Namibia' },
    { code: 'SZ', name: 'Eswatini' },
  ] as ReadonlyArray<{ code: 'BW' | 'MZ' | 'ZW' | 'NA' | 'SZ'; name: string }>,
  areaServed: ['Pretoria', 'Pretoria North', 'Centurion', 'Midrand', 'Johannesburg', 'Gauteng'] as readonly string[],
  /** Owner claim, kept as written. */
  recoveriesNote: 'Recoveries 24/7',
  hours: {
    mon: MON_THU,
    tue: MON_THU,
    wed: MON_THU,
    thu: MON_THU,
    fri: { opens: '08:00', closes: '14:00' },
    sat: null,
    sun: null,
  } as Record<DayKey, DayHours>,
};
