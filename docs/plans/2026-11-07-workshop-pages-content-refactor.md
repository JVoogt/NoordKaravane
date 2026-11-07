# Workshop pages: content-led refactor (plan)

Date: 2026-11-07. Branch: `content/workshop-pages-refactor`. Scope: Home, 5 service pages, Find us, shared components. `/shop/` untouched. No commit, no deploy.

Inputs: live audit at 1440/768/390 (Home 5,676 px desktop, 8,232 px mobile; hero 980 px; reviews 591 px for 31 words; closing band 807 px for 36 words; a 487 px hours-only block on every service page), three read-only advisors (conversion, SEO/GEO, UX), the verified Google profile (5.0 from 24 reviews, all five-star, hours match), 20 recent reviews.

## Page roles (one job each)

| Page | Job | Primary query |
|---|---|---|
| Home | Say what the workshop is, where, and send each visitor by problem to the right page or a WhatsApp message | caravan workshop Pretoria North, Noord Karavane |
| Caravan service | What a service includes, what it costs per axle setup, how the job runs | caravan service Pretoria North, caravan service price |
| Repairs | A fault: recognise the symptom, see what we fix, get it quoted first | caravan repairs, bearings, brakes, plumbing, woodrot |
| Electrical and solar | Turn a power need or fault into a free quote with the right details | caravan solar installation, 12 V / 220 V |
| Recoveries | A stranded owner calls in one tap and knows what to send | caravan and trailer recovery, cross-border |
| Lift kits | One priced upgrade: price, fit, warranty, does it fit my caravan | caravan lift kit price |
| Find us | Get to the gate in open hours: address, map, hours, areas | address, directions, hours |

## One home per fact

| Fact | Lives in | Removed from |
|---|---|---|
| Hours (full) | Closing contact band, Find us, footer, ticker | the hero contact card and the separate hours block on service pages |
| "Recoveries 24/7" | Recoveries hero badge | every Hours block |
| Insurance accreditation | Recoveries facts panel; Home trust strip as "Insurance-accredited recoveries" | Recoveries eyebrow and H1 repeats |
| Service checklist | Caravan service pricing section (visible list); FAQ answer becomes a short summary | |
| Process | Caravan service `#process` (five steps); Home shows a three-step summary linking to it | Home "Why us" cards |
| Google rating | Home trust strip + Home trust module; one quiet proof line on service heroes | |
| Turnaround claim | Caravan service facts + FAQ only | Home "Why us" |

## Shared changes
- Section headers: no "§ 01 / 04" numbers, no two-tone headlines, one-line H2 with the subline under it. Section padding cut.
- ContactBand: compact, left-aligned, two columns (heading, short line, WhatsApp primary + Call; then address, hours and a Find us / directions link). Takes a per-page heading. Replaces the separate hours block. On Home it is the `#location` section.
- Service cards: each leads with the problem in plain words ("Noisy wheel, brakes pulling, a leak or a soft floor"), then the service name and price tag. Names: "Caravan repairs", "Caravan recoveries".
- Service layout: a short hero lede from frontmatter (`lede`), the markdown body below the hero (symptoms and what we do), page-specific FAQ heading (`faqTitle`), FAQ in one column, compact related cards.
- Hours component shows the recoveries line only when asked.
- Floating WhatsApp button carries the page's own message. Quick-nav drops the duplicate Call chip.
- Reviews: compact trust module (rating, count, date checked, link). Genuine review candidates go into `reviews.ts` with `approved: false` for the owner to switch on.

## Not changed (protect rankings and checks)
URLs, canonicals, sitemap, Home title, the seven locked FAQ questions, the Caravan service section order, the Recoveries badge and Call-first buttons, the Repairs three columns, the lift kit price block, legacy hash targets (`#services`, `#reviews`, `#rentals`, `#location`, `#pricing`, `#process`, `#inspection-report`, `#faq`).

## Claims
Not strengthened anywhere. Removed from prominent spots pending owner confirmation: "500+ serviced", "Factory-trained", "Parts sourced with warranties attached". Kept as written and flagged: 24/7 recoveries, turnaround, lift kit fit time and warranty, on-site call-out, insurance accreditation. `paymentAccepted` removed from JSON-LD (not visible, not confirmed).
