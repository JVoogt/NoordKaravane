export interface ClientEnv { medusaUrl: string; publishableKey: string; ga4: string; pixel: string; turnstile: string; freeShipping: number }
let cached: ClientEnv | null = null;
export function clientEnv(): ClientEnv {
  if (cached) return cached;
  try { cached = JSON.parse(document.getElementById('nk-env')?.textContent || '{}'); } catch { cached = {} as ClientEnv; }
  return cached!;
}
