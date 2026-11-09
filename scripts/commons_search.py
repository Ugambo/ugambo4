#!/usr/bin/env python3
"""
Search Wikimedia Commons for freely licensed photos and print candidates with their licence.
Only public domain, CC0, CC BY and CC BY-SA files are kept.

Usage: python3 scripts/commons_search.py "hotel room bed" [limit]
"""
import json, re, sys, urllib.error, urllib.parse, urllib.request, html

UA = "ExploreKatsinaSetup/0.1 (https://github.com/Ugambo/ugambo4; sample media for a tourism site) python-urllib"
import time

def get_json(url, tries=7):
    """GET with Wikimedia-friendly pacing: pause, and back off on 429."""
    for i in range(tries):
        time.sleep(3 + i * 60)
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=30))
        except urllib.error.HTTPError as e:
            if e.code != 429 or i == tries - 1:
                raise
    return {}
OK = re.compile(r"^(public domain|pd|cc0|cc by(-sa)? [0-9.]+)", re.I)

def strip(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s or "")).strip()

def search(q, limit=12, width=1280):
    params = {
        "action": "query", "format": "json", "generator": "search", "gsrnamespace": 6,
        "gsrsearch": q + " filetype:bitmap", "gsrlimit": limit, "prop": "imageinfo",
        "iiprop": "url|extmetadata|size|mime", "iiurlwidth": width, "maxlag": 5,
    }
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(params)
    data = get_json(url)
    out = []
    for p in (data.get("query", {}).get("pages", {}) or {}).values():
        ii = (p.get("imageinfo") or [{}])[0]
        m = ii.get("extmetadata", {})
        lic = strip(m.get("LicenseShortName", {}).get("value"))
        if not OK.match(lic) or ii.get("mime") not in ("image/jpeg", "image/png"):
            continue
        if ii.get("width", 0) < 1000:
            continue
        out.append({
            "title": p["title"],
            "author": strip(m.get("Artist", {}).get("value"))[:120],
            "license": lic,
            "license_url": strip(m.get("LicenseUrl", {}).get("value")),
            "source": ii.get("descriptionurl"),
            "thumb": ii.get("thumburl"),
            "desc": strip(m.get("ImageDescription", {}).get("value"))[:160],
        })
    return out

if __name__ == "__main__":
    for c in search(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 12):
        print(json.dumps(c, ensure_ascii=False))
