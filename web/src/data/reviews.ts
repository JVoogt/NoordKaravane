// Real Google reviews. Only entries with approved: true are rendered, and only the owner sets that flag.
// The old page's three unattributed quotes are not migrated.
//
// Candidates below were read from the public Google Business Profile on 2026-11-07 (all five-star). Text is the
// reviewer's own wording in the language they wrote it in; Google's machine translations are never stored or quoted.
// Surnames are shortened because this repo is public. url is the public Maps listing (Google gives no per-review link).
// To publish: the owner picks two or three, sets approved: true, and checks the excerpt still matches Google.
// 2026-11-07: the owner approved Vernon d. P., Zenelda S. and Johan & Magda A.
const LISTING = 'https://www.google.com/maps?cid=1109550773885984048';

export const REVIEWS: Array<{ name: string; date: string; text: string; url: string; approved: boolean; lang?: string }> = [
  {
    // Electrical and water work; mentions Christiaan by name.
    name: 'Vernon d. P.',
    date: '2026-10-19',
    text: 'From repairs to installing new components such as my shower system and battery system, everything has been completed professionally and works exactly as it should.',
    url: LISTING,
    approved: true,
  },
  {
    // Supports the written report claim.
    name: 'Zenelda S.',
    date: '2026-07-09',
    text: 'Very pleased on a professional job done. Christian provides a comprehensive report and provides constant feedback.',
    url: LISTING,
    approved: true,
  },
  {
    // Caravan service on a named brand.
    name: 'K. N.',
    date: '2026-08-06',
    text: 'Took my Jurgens Xcape for a service, good service and workmanship.',
    url: LISTING,
    approved: false,
  },
  {
    // Supports the on-site service claim.
    name: 'Cornelia N.',
    date: '2026-08-23',
    text: 'Prompt, professional service. They were able to do the repair on site.',
    url: LISTING,
    approved: false,
  },
  {
    // Afrikaans original. 50 mm lift on a Sprite Scenic, and a service booklet handed over (supports the logbook claim).
    name: 'Johan & Magda A.',
    date: '2026-09-16',
    text: 'Het verlede week my Sprite Scenic by Noord Karavane met 50mm laat lig. Baie tevrede met die eind produk en die professionele diens was regtig old school. Ek het tot ń diensboekie ontvang vir toekomstige dienste.',
    url: LISTING,
    approved: true,
    lang: 'af',
  },
];
