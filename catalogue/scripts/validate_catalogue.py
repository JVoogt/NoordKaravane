"""Validate catalogue/products.json against what the Medusa seed (createProductsWorkflow) will accept.
Usage: python3 -I validate_catalogue.py ../products.json   (exit 1 on any problem)
"""
import json, re, sys
RESERVED = ["cart", "checkout", "order", "category", "search", "sitemap.xml", "products", "about", "contact", "faq", "how-to-order", "shipping", "legal", "api", "healthz", "robots.txt"]  # keep in sync with storefront/src/lib/format.ts
FORBIDDEN = [(r"href=[\"']?[^\"' >]*kampi\.co\.za", "link to another shop"), (r"free over R\s?1[ ,]?000\b", "old store free-delivery threshold"), (r"[\w.+-]+@[\w-]+\.[\w.]+", "email address in description"), (r"Planning a camping trip", "cross-promo paragraph")]
bad = []
d = json.load(open(sys.argv[1]))
handles, skus = set(), set()
for p in d:
    h, t = p["handle"], p["title"]
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", h): bad.append(f"{t}: handle {h!r} is not url/file-safe ascii")
    if h in RESERVED: bad.append(f"{t}: handle {h!r} collides with a storefront route")
    for fld in ("description", "description_html"):
        for pat, why in FORBIDDEN:
            if re.search(pat, p[fld] or "", re.I): bad.append(f"{t}: {fld} contains {why}")
    if h in handles: bad.append(f"{t}: duplicate handle {h}")
    handles.add(h)
    titles = [o["name"] for o in p["options"]] or ["Default"]
    if len(set(titles)) != len(titles): bad.append(f"{t}: duplicate option titles {titles}")
    allowed = {o["name"]: set(o["values"]) for o in p["options"]}
    if any(len(o["values"]) != len(set(o["values"])) for o in p["options"]): bad.append(f"{t}: duplicate option values")
    seen = set()
    for v in p["variants"]:
        if set(v["options"]) != set(titles): bad.append(f"{t}: variant {v['sku']} option keys {sorted(v['options'])} != {sorted(titles)}")
        for k, val in v["options"].items():
            if val not in allowed.get(k, ()): bad.append(f"{t}: variant {v['sku']} value {k}={val!r} not in {sorted(allowed.get(k, []))}")
        combo = tuple(sorted(v["options"].items()))
        if combo in seen: bad.append(f"{t}: duplicate combination {combo}")
        seen.add(combo)
        if v["sku"] in skus: bad.append(f"{t}: duplicate sku {v['sku']}")
        skus.add(v["sku"])
        if not v["price_zar"] or v["price_zar"] <= 0: bad.append(f"{t}: variant {v['sku']} has no price")
    if p["type"] == "variable" and not p["variants"]: bad.append(f"{t}: variable product without variants")
    if p["type"] == "simple":
        if p["sku"] in skus: bad.append(f"{t}: duplicate sku {p['sku']}")
        skus.add(p["sku"])
        if not p["price_zar"] or p["price_zar"] <= 0: bad.append(f"{t}: no price")
    if not p["images"]: bad.append(f"{t}: no images")
    for c in p["categories"]: pass
for b in bad: print("FAIL", b)
print(f"{len(d)} products checked, {len(bad)} problems")
sys.exit(1 if bad else 0)
