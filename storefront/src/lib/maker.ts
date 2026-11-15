// The maker's brand for Product structured data. Mirrors backend/src/lib/product-identity.ts (the feeds),
// so Google sees the same brand on the page and in the Merchant Center feed. Unknown makers return null.
const MAKERS: Record<string, string> = {
  victron: 'Victron Energy', renogy: 'Renogy', lumeno: 'Lumeno', ring: 'Ring', agv: 'AGV',
  rambler: 'Rambler', campaholix: 'Campaholix', kampi: 'Kampi',
};

export function makerBrand(title: string | null | undefined): string | null {
  const first = String(title ?? '').trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? '';
  return MAKERS[first] ?? null;
}
