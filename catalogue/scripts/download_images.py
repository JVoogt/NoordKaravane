"""Download every product image listed in catalogue/products.json and save it as webp in storefront/public/products/.
Usage: python3 -I download_images.py ../products.json ../../storefront/public/products
Needs Pillow. Idempotent: existing files are skipped. Long edge is capped at 1400 px (the product infographics stay
legible), quality 82, files chmod 644 (containers must be able to read them).
"""
import io, json, os, sys, urllib.request
from PIL import Image
src, dest = sys.argv[1], sys.argv[2]
os.makedirs(dest, exist_ok=True)
n = fail = 0
for p in json.load(open(src)):
    for i in p["images"]:
        out = os.path.join(dest, os.path.basename(i["src"]))
        if os.path.exists(out):
            continue
        try:
            req = urllib.request.Request(i["source_src"], headers={"User-Agent": "nk-catalogue/1"})
            im = Image.open(io.BytesIO(urllib.request.urlopen(req, timeout=60).read()))
            im = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") else "RGB")
            im.thumbnail((1400, 1400))
            im.save(out, "WEBP", quality=82, method=6)
            os.chmod(out, 0o644)
            n += 1
        except Exception as e:
            fail += 1
            print("FAIL", i["source_src"], e)
print(f"saved {n}, failed {fail}")
