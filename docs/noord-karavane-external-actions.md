# External actions (not in this repo)

Date: 2026-11-08. These need a login the repo does not have. Nothing below has been changed yet.

## 1. Kampi blog: wrong workshop hours

The site, the Google Business Profile and `web/src/data/business.ts` all say **Mon to Thu 08:00 to 16:00, Fri 08:00 to 14:00, closed weekends**. Two Kampi posts say otherwise:

| URL | Published now | Change to |
|---|---|---|
| https://kampi.co.za/blog/servicecenters | "Mon to Fri 08:00 to 17:00" | "Mon to Thu 08:00 to 16:00, Fri 08:00 to 14:00" |
| https://kampi.co.za/blog/kampicare | "Hours: Monday to Friday, 08:00 to 17:00" | "Hours: Monday to Thursday 08:00 to 16:00, Friday 08:00 to 14:00" |

The text lives in Kampi's blog database (served from `/api/v1/blog/posts/{slug}`), not in a repo file. After editing:

1. Check with `curl -s https://kampi.co.za/api/v1/blog/posts/servicecenters | grep -o '08:00[^"]*'`, and the same for `kampicare`.
2. In Google Search Console for kampi.co.za, use URL Inspection, then "Request indexing" for both URLs.
3. Optional: point the servicecenters map link at `https://www.google.com/maps?cid=1109550773885984048`.

## 2. Google Business Profile

The hours match the site. The profile description still says "no appointment needed for quotes" and "Factory-trained on all major caravan brands", and lists Hartbeespoort. The site makes none of these claims (factory-trained was removed pending your word). Confirm them, or edit them out at business.google.com, Edit profile, About.

## 3. Facebook page

Facebook blocks anonymous checks, so the hours there were not verified. Log in and confirm that the page shows the same hours, address (252 General Beyers Street, Pretoria North, 0182) and phone (083 334 9357).

## 4. Cloudflare: AI crawler policy

What the repo now does: `web/public/robots.txt` names OAI-SearchBot, ChatGPT-User, Claude-SearchBot, Claude-User and PerplexityBot as allowed, with `Content-Signal: search=yes,ai-input=yes,ai-train=no`. It names GPTBot, ClaudeBot, anthropic-ai, CCBot, Google-Extended, Applebot-Extended, meta-externalagent and Bytespider as disallowed. Cloudflare's managed block still sits above this file in production. Duplicate groups for the same bot merge (RFC 9309), so the two agree.

The signals, per Cloudflare's content-signals text in the live robots.txt:

- `search=yes`: index the site and show links and short excerpts in search results. It does not cover AI summaries.
- `ai-input=yes`: use the pages to ground an AI answer in real time (retrieval). This is what lets ChatGPT search, Claude and Perplexity quote the site. Cloudflare's managed block leaves it unset, so the repo file sets it for the named answer agents.
- `ai-train=no`: no training or fine-tuning on the content. Keep this.
- `use=reference` versus `use=full`: Cloudflare adds `use=reference` itself, and still describes `use` as experimental. "reference" means index, excerpt and link back. "full" also allows summarising and reproducing, which suits answer engines better but gives away more of the copy. For a marketing site whose whole aim is to be found and quoted correctly, "full" is the commercially better choice. It is not a dashboard toggle today, so leave it until Cloudflare offers one.

Dashboard steps (Cloudflare, noordkaravane.co.za):

1. Security, then Settings, filter "Bot traffic", then "AI Crawler and Agent access" (it may show as AI Crawl Control). Set Training to Disallow, Search to Allow and Agents (user-initiated fetches) to Allow.
2. AI Crawl Control, then Crawlers: OAI-SearchBot, ChatGPT-User, Claude-SearchBot and Claude-User should show Allow, with no unusual unsuccessful-request trend.
3. Security, then Events: filter by user agent for the same names and look for Block or Challenge actions. If a rule fires on a verified bot, add a skip for verified bots on that rule.
4. Bot Fight Mode: if it is on, confirm that it does not challenge verified bots (it is designed not to, but check the Events above).
5. A 200 response to a spoofed user agent from your own IP proves nothing. Only the Crawlers and Events views show what happens to the real, verified IP ranges.

Google-Extended stays blocked. That also keeps the site out of grounding in the Gemini apps. Allowing it would also allow Gemini training, so it's your call; it is not changed here.

## 5. Not done here, worth doing next

- The shop (`/shop/`) publishes the same `@id` as the workshop but as `Organization`, with phone `083 334 9357` instead of `+27833349357`, no trailing slash on the URL and Facebook without `www`. Align it with `storefront/src/lib/business.ts` on the next shop deploy.
- The social share image (`web/public/assets/images/og-image-1200.jpg`) still says "500+ caravan services" and "100% parts warranty". Neither is confirmed. Replace it, or confirm both claims.
- Afrikaans pages: a separate project (needs a translation plan), not part of this pass.
