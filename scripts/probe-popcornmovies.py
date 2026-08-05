"""
One-off probe for popcornmovies.io (CF challenge + player network map).
Usage: python scripts/probe-popcornmovies.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parents[1] / "tmp" / "popcornmovies-probe.json"
HOME = "https://popcornmovies.io/"
CANDIDATES = [
    "https://popcornmovies.io/movie/27205",
    "https://popcornmovies.io/movies/27205",
    "https://popcornmovies.io/watch/movie/27205",
    "https://popcornmovies.io/watch/27205",
    "https://popcornmovies.io/film/27205",
    "https://popcornmovies.io/title/27205",
    "https://popcornmovies.io/movie/inception",
    "https://popcornmovies.io/movies/inception-2010",
]


def interesting(url: str) -> bool:
    u = url.lower()
    keys = (
        "m3u8",
        "mp4",
        "playlist",
        "embed",
        "stream",
        "vidsrc",
        "2embed",
        "proxy",
        "/api/",
        "tmdb",
        "subtitle",
        "vtt",
        "player",
        "source",
        "hls",
    )
    return any(k in u for k in keys)


def main() -> int:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    result: dict = {
        "home": {},
        "routes": [],
        "network": [],
        "iframes": [],
        "page_links": [],
        "notes": [],
    }

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/122.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1365, "height": 900},
            locale="en-US",
        )
        page = context.new_page()

        def on_response(resp):
            try:
                url = resp.url
                if not interesting(url) and resp.request.resource_type not in (
                    "xhr",
                    "fetch",
                    "document",
                    "media",
                ):
                    return
                entry = {
                    "status": resp.status,
                    "type": resp.request.resource_type,
                    "method": resp.request.method,
                    "url": url[:500],
                    "ctype": (resp.headers or {}).get("content-type", "")[:80],
                }
                if interesting(url) or resp.request.resource_type in ("xhr", "fetch"):
                    result["network"].append(entry)
            except Exception as exc:  # noqa: BLE001
                result["notes"].append(f"response hook error: {exc}")

        page.on("response", on_response)

        print(">> home")
        page.goto(HOME, wait_until="domcontentloaded", timeout=90_000)
        page.wait_for_timeout(8_000)
        title = page.title()
        html = page.content()
        challenged = "Just a moment" in title or "cf-browser-verification" in html
        result["home"] = {
            "url": page.url,
            "title": title,
            "challenged": challenged,
            "html_len": len(html),
            "snippet": re.sub(r"\s+", " ", html)[:400],
        }
        print(f"   title={title!r} challenged={challenged} url={page.url}")

        if challenged:
            print(">> waiting for CF challenge...")
            try:
                page.wait_for_function(
                    "() => !document.title.includes('Just a moment')",
                    timeout=45_000,
                )
                page.wait_for_timeout(3_000)
                result["home"]["after_challenge"] = {
                    "title": page.title(),
                    "url": page.url,
                }
                print(f"   cleared -> {page.title()!r}")
            except Exception as exc:  # noqa: BLE001
                result["notes"].append(f"CF wait failed: {exc}")
                print(f"   CF wait failed: {exc}")

        # Collect homepage anchors for route discovery
        try:
            hrefs = page.eval_on_selector_all(
                "a[href]",
                "els => els.map(e => e.getAttribute('href')).filter(Boolean).slice(0, 80)",
            )
            result["page_links"] = hrefs
            print(f"   links={len(hrefs)}")
        except Exception as exc:  # noqa: BLE001
            result["notes"].append(f"link scrape failed: {exc}")

        # Try candidate watch/detail routes
        for url in CANDIDATES:
            print(f">> try {url}")
            try:
                resp = page.goto(url, wait_until="domcontentloaded", timeout=45_000)
                page.wait_for_timeout(4_000)
                frames = [f.url for f in page.frames if f.url and f.url != page.url]
                entry = {
                    "url": url,
                    "final": page.url,
                    "status": resp.status if resp else None,
                    "title": page.title(),
                    "iframes": frames[:20],
                    "challenged": "Just a moment" in page.title(),
                }
                result["routes"].append(entry)
                result["iframes"].extend(frames)
                print(f"   status={entry['status']} title={entry['title']!r} frames={len(frames)}")
                # If we landed on a real page, poke play buttons
                if not entry["challenged"] and entry["status"] and entry["status"] < 400:
                    for sel in [
                        "button:has-text('Play')",
                        "button:has-text('Watch')",
                        "[class*='play']",
                        "video",
                    ]:
                        try:
                            loc = page.locator(sel).first
                            if loc.count() and loc.is_visible():
                                loc.click(timeout=2000)
                                page.wait_for_timeout(3000)
                                break
                        except Exception:
                            pass
                    break
            except Exception as exc:  # noqa: BLE001
                result["routes"].append({"url": url, "error": str(exc)})
                print(f"   error: {exc}")

        # Dedupe network
        seen = set()
        uniq = []
        for n in result["network"]:
            key = (n.get("method"), n.get("status"), n.get("url"))
            if key in seen:
                continue
            seen.add(key)
            uniq.append(n)
        result["network"] = uniq[:200]
        result["iframes"] = list(dict.fromkeys(result["iframes"]))[:50]

        browser.close()

    OUT.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(f"\nWrote {OUT}")
    print(f"network hits={len(result['network'])} routes={len(result['routes'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
