#!/usr/bin/env python3
"""
Download chosen Wikimedia Commons photos (web size, 1280px wide) and record their credits.

Usage: python3 scripts/fetch_commons.py sample-data/media/manifest.json sample-data/media
manifest.json: {"hotel-room-1": "File:Bed in hotel room.jpg", ...}
Writes <key>.jpg and credits.json (author, licence, licence URL, source page) next to them.
Only public domain, CC0, CC BY and CC BY-SA files are accepted.
"""
import hashlib, json, os, sys, time, urllib.parse, urllib.request
sys.path.insert(0, os.path.dirname(__file__))
from commons_search import UA, OK, strip, get_json

def info(titles):
    params = {"action": "query", "format": "json", "prop": "imageinfo", "titles": "|".join(titles),
              "iiprop": "url|extmetadata|mime|size", "maxlag": 5}
    data = get_json("https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(params))
    out = {}
    for p in data.get("query", {}).get("pages", {}).values():
        ii = (p.get("imageinfo") or [{}])[0]
        m = ii.get("extmetadata", {})
        out[p["title"]] = {
            "title": p["title"],
            "author": strip(m.get("Artist", {}).get("value"))[:160],
            "license": strip(m.get("LicenseShortName", {}).get("value")),
            "license_url": strip(m.get("LicenseUrl", {}).get("value")),
            "source": ii.get("descriptionurl"),
            "thumb": std_thumb(p["title"], ii.get("url"), ii.get("width", 0)),
        }
    return out

def std_thumb(title, original, width, size=1280):
    """Wikimedia's standard-size thumbnail URL (what they ask automated tools to use)."""
    if not original or width <= size:
        return original
    name = title.split(":", 1)[1].replace(" ", "_")
    h = hashlib.md5(name.encode()).hexdigest()
    q = urllib.parse.quote(name)
    return f"https://upload.wikimedia.org/wikipedia/commons/thumb/{h[0]}/{h[:2]}/{q}/{size}px-{q}"

def resize(data, dest, width=1280):
    """Save as a web-size JPEG (max 1280px wide, quality 82, no metadata)."""
    import io
    from PIL import Image, ImageOps
    im = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert("RGB")
    if im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    im.save(dest, "JPEG", quality=82, optimize=True, progressive=True)

def main(manifest, outdir):
    want = json.load(open(manifest))
    os.makedirs(outdir, exist_ok=True)
    credits_path = os.path.join(outdir, "credits.json")
    credits = json.load(open(credits_path)) if os.path.exists(credits_path) else {}
    titles = list(dict.fromkeys(want.values()))
    meta = {}
    for i in range(0, len(titles), 20):
        meta.update(info(titles[i:i + 20]))
    for key, title in want.items():
        m = meta.get(title)
        if not m or not m["thumb"]:
            print("MISSING", key, title); continue
        if not OK.match(m["license"]):
            print("REJECTED licence", key, m["license"]); continue
        dest = os.path.join(outdir, key + ".jpg")
        if not os.path.exists(dest):
            time.sleep(6)
            data = urllib.request.urlopen(urllib.request.Request(m["thumb"], headers={"User-Agent": UA}), timeout=120).read()
            resize(data, dest)
        credits[key] = {k: m[k] for k in ("title", "author", "license", "license_url", "source")}
        print("OK", key, "|", m["license"], "|", m["author"][:40])
    json.dump(credits, open(credits_path, "w"), indent=1, ensure_ascii=False, sort_keys=True)

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
