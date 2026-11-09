#!/usr/bin/env python3
"""
Download chosen Wikimedia Commons photos (1280px wide) and record their credits.

Usage: python3 scripts/fetch_commons.py sample-data/media/manifest.json sample-data/media
manifest.json: {"hotel-room-1": "File:Bed in hotel room.jpg", ...}

Licence and author are read from each file's description page (wikitext). Only public domain,
CC0, CC BY and CC BY-SA files are accepted; anything unclear is skipped and reported.
Writes <key>.jpg and credits.json (title, author, license, license_url, source).
"""
import hashlib, io, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request

UA = "ExploreKatsinaSetup/0.1 (https://github.com/Ugambo/ugambo4; sample media for a tourism site)"


def get(url, tries=4):
    for i in range(tries):
        time.sleep(4 + i * 30)
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=90).read()
        except urllib.error.HTTPError as e:
            if e.code not in (429, 503) or i == tries - 1:
                raise
    return b""


def licence(wikitext):
    """Return (short name, url) for the first acceptable licence template, else (None, None)."""
    t = wikitext.lower()
    for m in re.finditer(r"cc-(by-sa|by|zero)(?:-(\d\.\d))?", t):
        kind, ver = m.group(1), m.group(2)
        if kind == "zero":
            return "CC0 1.0", "https://creativecommons.org/publicdomain/zero/1.0/"
        ver = ver or ("4.0" if kind == "by-sa" else "4.0")
        return f"CC {kind.upper()} {ver}", f"https://creativecommons.org/licenses/{kind}/{ver}/"
    if re.search(r"\{\{\s*geograph\s*\|", t):  # Geograph Britain & Ireland photos are CC BY-SA 2.0.
        return "CC BY-SA 2.0", "https://creativecommons.org/licenses/by-sa/2.0/"
    if re.search(r"\{\{\s*(pd-|public domain)", t):
        return "Public domain", ""
    return None, None


def author(wikitext):
    m = re.search(r"\|\s*author\s*=\s*(.+)", wikitext, re.I)
    if m:
        a = m.group(1).strip()
        a = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]+)\]\]", r"\1", a)        # [[User:X|X]] → X
        a = re.sub(r"\[https?://\S+\s+([^\]]+)\]", r"\1", a)            # [url name] → name
        a = re.sub(r"\{\{[^}]*\}\}", "", a)                              # drop templates
        a = re.sub(r"<[^>]+>", "", a).strip(" |'")
        if a:
            return a[:160]
    m = re.search(r"\{\{\s*geograph\s*\|\s*\d+\s*\|\s*([^}|]+)", wikitext, re.I)
    if m:
        return m.group(1).strip()
    return ""


def thumb_url(name, size=1280):
    h = hashlib.md5(name.encode()).hexdigest()
    q = urllib.parse.quote(name)
    return f"https://upload.wikimedia.org/wikipedia/commons/thumb/{h[0]}/{h[:2]}/{q}/{size}px-{q}", \
           f"https://upload.wikimedia.org/wikipedia/commons/{h[0]}/{h[:2]}/{q}"


def save(data, dest, width=1280):
    from PIL import Image, ImageOps
    im = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert("RGB")
    if im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    im.save(dest, "JPEG", quality=82, optimize=True, progressive=True)


def main(manifest, outdir, pause=75, passes=3):
    """Slow and patient: one photo at a time, skipping refused ones and retrying them later."""
    for n in range(passes):
        missing = one_pass(manifest, outdir, pause)
        if not missing:
            return
        print(f"pass {n + 1}: still missing {missing}", flush=True)
        time.sleep(600)


def one_pass(manifest, outdir, pause):
    want = json.load(open(manifest))
    missing = []
    os.makedirs(outdir, exist_ok=True)
    cpath = os.path.join(outdir, "credits.json")
    credits = json.load(open(cpath)) if os.path.exists(cpath) else {}
    for key, title in want.items():
        dest = os.path.join(outdir, key + ".jpg")
        if key in credits and os.path.exists(dest):
            continue
        name = title.split(":", 1)[1].replace(" ", "_")
        time.sleep(pause)
        try:
            wt = get("https://commons.wikimedia.org/w/index.php?" + urllib.parse.urlencode({"title": "File:" + name, "action": "raw"})).decode("utf-8", "replace")
        except Exception as e:
            print("WAIT page", key, str(e)[:60], flush=True); missing.append(key); continue
        lic, lic_url = licence(wt)
        who = author(wt)
        if not lic:
            print("SKIP (licence unclear)", key, flush=True); continue
        thumb, original = thumb_url(name)
        try:
            try:
                data = get(thumb)
            except urllib.error.HTTPError as e:
                if e.code in (429, 503):
                    raise
                data = get(original)  # Original smaller than 1280px: no thumbnail of that size.
            save(data, dest)
        except Exception as e:
            print("WAIT file", key, str(e)[:60], flush=True); missing.append(key); continue
        credits[key] = {"title": title, "author": who, "license": lic, "license_url": lic_url,
                        "source": "https://commons.wikimedia.org/wiki/" + urllib.parse.quote("File:" + name)}
        json.dump(credits, open(cpath, "w"), indent=1, ensure_ascii=False, sort_keys=True)
        print("OK", key, "|", lic, "|", who[:50], flush=True)
    return missing


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
