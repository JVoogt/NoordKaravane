import { siteUrl } from "./business"

/** Purge URLs from the Cloudflare cache. No-op without CF_ZONE_ID and CF_API_TOKEN. */
export async function purgeUrls(urls: string[], logger?: { info: Function; warn: Function }) {
  const zone = process.env.CF_ZONE_ID
  const token = process.env.CF_API_TOKEN
  if (!zone || !token || !urls.length) return false
  const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zone}/purge_cache`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ files: urls.slice(0, 30) }),
  })
  if (!res.ok) {
    logger?.warn(`[cf-purge] ${res.status} ${await res.text().catch(() => "")}`)
    return false
  }
  logger?.info(`[cf-purge] purged ${urls.length} url(s)`)
  return true
}

export function productUrls(handle?: string | null): string[] {
  const base = siteUrl()
  const urls = [`${base}/shop/`, `${base}/shop/sitemap.xml`]
  if (handle) urls.unshift(`${base}/shop/${handle}/`)
  return urls
}
