"""Normalise the raw Kampi WooCommerce Store API dump into catalogue/products.json.
Usage: python3 -I normalise_kampi.py kampi-full.json ../products.json ../GAPS.md
"""
import html, json, os, re, sys

TIER_G = {"small": 500, "medium": 3000, "bulky": 15000}  # keep in sync with config/business.json shipping.tier_weights_g
OPTION_NAMES = {"Color": "Colour", "T-shirt": "T-shirt size", "T-shirt Size": "T-shirt size",
                "Jacket Size": "Jacket size", "Choose your flavours:": "Flavour"}
# first match wins; checked against lower-cased "title | categories". Owner overrides win over this.
TIER_RULES = [
    ("bulky", ["lithium battery", "roadshower", "bos braai", "makabrai", "camping chair", "potjie", "starter pack", "ice maker", "pen pusher"]),
    ("small", ["sticker", "booklet", "t-shirt", "hot chocolate", "mix", "tentpenne", "mug", "beer glass", "cable", "torch", "light", "headlight", "first aid kit"]),
]

raw = json.load(open(sys.argv[1]))
GROUP = {  # top-level Woo category -> NK shop collection handle
    "KampiHost Essentials": "kampihost-essentials", "Camping Gear & Equipment": "camping-gear",
    "BoskampKos Camping Food": "boskampkos", "Kampi Merchandise": "kampi-merchandise",
    "Stickers & Decals": "stickers",
}
def clean(s): return html.unescape(re.sub(r"\s+", " ", html.unescape(s or ""))).strip()
def text(h): return clean(re.sub(r"<[^>]+>", " ", re.sub(r"</(p|li|div|h\d)>", "\n", h or ""))).strip()
def scrub(h):
    """Remove content that is wrong on the NK shop: cross-promotion to other shops and the old store's delivery promises.
    NK's own delivery terms (collection, Pudo, weight-banded courier, free over R2,500) are shown by the storefront."""
    h = h or ""
    # the "Planning a camping trip? Book a caravan or camper on kampi.co.za" cross-promo paragraph
    h = re.sub(r"<p\b[^>]*>(?:(?!</p>).)*?Planning a camping trip(?:(?!</p>).)*?</p>", "", h, flags=re.S | re.I)
    # any remaining link to the other shop becomes plain text (prose mentions of the Kampi platform stay: these are products for Kampi hosts)
    h = re.sub(r"<a\b[^>]*href=[\"'][^\"']*kampi\.co\.za[^\"']*[\"'][^>]*>(.*?)</a>", r"\1", h, flags=re.S | re.I)
    # the old store's courier promises (R1,000 threshold) contradict NK's shipping policy
    h = re.sub(r",? and delivered nationwide with The Courier Guy, free over R[\d,\s]+\.", ".", h, flags=re.I)
    h = re.sub(r"\s*Nationwide delivery with The Courier Guy, free over R[\d,\s]+\.", "", h, flags=re.I)
    h = re.sub(r"<p\b[^>]*>\s*</p>", "", h)
    return h.strip()

def slugify(s): return re.sub(r"[^a-z0-9]+", "-", clean(s).lower()).strip("-")
def rand(p): return round(int(p["price"]) / 10 ** p["currency_minor_unit"], 2)

overrides_path = os.path.join(os.path.dirname(os.path.abspath(sys.argv[2])), "overrides.json")
overrides = json.load(open(overrides_path)) if os.path.exists(overrides_path) else {}  # {handle: {ship_tier, sku, ...}}

def tier_for(title, cats, weight_kg):
    if weight_kg:
        g = weight_kg * 1000
        return "small" if g <= 1000 else "medium" if g <= 5000 else "bulky"
    hay = (title + " | " + " ".join(cats)).lower()
    for tier, words in TIER_RULES:
        if any(w in hay for w in words):
            return tier
    return "medium"

seen_skus = set()
out, gaps = [], {"no_sku": [], "no_weight": [], "no_description": []}
for p in raw:
    name = clean(p["name"])
    cats = [clean(c["name"]) for c in p["categories"]]
    prod = {
        "source_id": p["id"], "handle": p["slug"], "sku": p["sku"] or None, "title": name, "type": p["type"],
        "description": text(scrub(p["description"])) or text(scrub(p["short_description"])),
        "description_html": scrub(p["description"] or p["short_description"]),
        "price_zar": rand(p["prices"]), "regular_price_zar": round(int(p["prices"]["regular_price"]) / 100, 2),
        "on_sale": p["on_sale"], "categories": cats, "tags": [clean(t["name"]) for t in p["tags"]],
        "weight_kg": float(p["weight"]) if p["weight"] else None,
        "dimensions_cm": {k: float(v) for k, v in p["dimensions"].items() if v} or None,
        "in_stock": p["is_in_stock"], "source_url": p["permalink"],
        "dropship_supplier": "the-first-responders" if (p["sku"] or "").startswith("TFR-") else None,
        "options": [{"name": a["name"], "values": [clean(t["name"]) for t in a["terms"]]} for a in p["attributes"] if a["has_variations"]],
        "images": [{"src": f"/products/{p['slug']}-{n + 1}{'.webp'}",
                    "source_src": i["src"], "alt": clean(i.get("alt")) or name} for n, i in enumerate(p["images"])],
        "variants": [{"source_id": v["id"], "sku": v["sku"] or None, "price_zar": rand(v["prices"]),
                      "in_stock": v["is_in_stock"], "weight_kg": float(v["weight"]) if v["weight"] else None,
                      "options": {a["name"]: clean(a["value"]) for a in next(x for x in p["variations"] if x["id"] == v["id"])["attributes"]}}
                     for v in p["_variations"]],
    }
    ov = overrides.get(p["slug"], {})
    prod["ship_tier"] = ov.get("ship_tier") or tier_for(name, cats, prod["weight_kg"])
    prod["ship_tier_source"] = "override" if ov.get("ship_tier") else ("woo-weight" if prod["weight_kg"] else "heuristic")
    prod["weight_g"] = int(prod["weight_kg"] * 1000) if prod["weight_kg"] else TIER_G[prod["ship_tier"]]
    prod["sku"] = ov.get("sku") or prod["sku"] or f"NK-{p['id']}"
    prod["sku_source"] = "woo" if p["sku"] else "generated"
    for o in prod["options"]:
        o["name"] = OPTION_NAMES.get(o["name"], o["name"])
    for v in prod["variants"]:
        v["options"] = {OPTION_NAMES.get(k, k): val for k, val in v["options"].items()}
        v["weight_g"] = int(v["weight_kg"] * 1000) if v["weight_kg"] else prod["weight_g"]
        suffix = "-".join(re.sub(r"[^A-Za-z0-9]+", "", x).upper() for x in v["options"].values()) or str(v["source_id"])
        if not v["sku"] or v["sku"] == prod["sku"] or v["sku"] in seen_skus:  # Woo variations inherit the parent SKU
            v["sku"] = f'{prod["sku"]}-{suffix}'
        while v["sku"] in seen_skus:
            v["sku"] += "-" + str(v["source_id"])
        seen_skus.add(v["sku"])
    out.append(prod)
    if not p["sku"]: gaps["no_sku"].append(f"{name} (generated {prod['sku']})")
    if not p["weight"]: gaps["no_weight"].append(f"{name}: {prod['ship_tier']} ({prod['ship_tier_source']})")
    if not prod["description"]: gaps["no_description"].append(name)
json.dump(out, open(sys.argv[2], "w"), indent=2, ensure_ascii=False)
nv = sum(len(x["variants"]) for x in out)
with open(sys.argv[3], "w") as f:
    f.write(f"# Catalogue gaps (auto-generated)\n\n{len(out)} products, {nv} variants, extracted from store.kampi.co.za.\n\n")
    for k, v in gaps.items():
        f.write(f"## {k} ({len(v)})\n" + "".join(f"- {n}\n" for n in v) + "\n")
print(len(out), nv, {k: len(v) for k, v in gaps.items()})
