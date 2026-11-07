// The ONLY owner of price numbers. Pure: no imports, no astro:*, no DOM.
// Amounts are bare numbers; every displayed price goes through fmtR.
export type AxleId = 'unbraked-1' | 'braked-1' | 'braked-2' | 'other';
export type AddonId = 'lift-kit' | 'pre-trip' | 'water-test' | 'solar-quote';

export const AXLE_OPTIONS: ReadonlyArray<{ id: AxleId; label: string; price: number }> = Object.freeze([
  { id: 'unbraked-1', label: 'Single, unbraked', price: 949 },
  { id: 'braked-1', label: 'Single, braked', price: 1499 },
  { id: 'braked-2', label: 'Double, braked', price: 2299 },
  { id: 'other', label: 'Not sure', price: 1499 },
]);

/** A price of 0 (the free solar quote) renders as POA wherever it is shown. */
export const ADDONS: ReadonlyArray<{ id: AddonId; label: string; price: number }> = Object.freeze([
  { id: 'lift-kit', label: '50 mm lift kit fitted', price: 1980 },
  { id: 'pre-trip', label: 'Pre-trip safety inspection', price: 850 },
  { id: 'water-test', label: 'Water system pressure test', price: 1200 },
  { id: 'solar-quote', label: 'Solar system quote (free)', price: 0 },
]);

/** Rand label with plain U+0020 digit grouping. Deliberately not the Intl locale formatter: ICU groups en-ZA with a no-break space. */
export function fmtR(n: number): string {
  return 'R' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
