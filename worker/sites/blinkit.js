import { Impit } from "impit";
import { randomUUID, randomBytes } from "crypto";
import { latLongForPincode } from "../lib/pincode.js";
import { getChromeHeaders } from "../lib/http.js";

/**
 * Blinkit — hyperlocal quick-commerce. All requests go via their
 * internal API, which requires:
 *   1. A `req_key` — embedded in their web app JS bundle, rotated periodically
 *   2. An `auth_key` — fetched per-session via the req_key
 *
 * Previous versions hardcoded the req_key, which goes stale and causes 403s.
 * This version scrapes it from the web app at runtime.
 */

const impit = new Impit({
    browser: "chrome",
    ...(process.env.SCRAPER_PROXY ? { proxyUrl: process.env.SCRAPER_PROXY } : {}),
});

// Fresh identifiers per worker run to avoid fingerprint staleness.
const DEVICE_ID = randomBytes(8).toString("hex"); // 16-char hex, like Android device IDs
const SESSION_UUID = randomUUID();

let cachedReqKey = null;
let authKeyCache = null;

/** Browser-like headers for Blinkit web requests. */
function chromeHeaders() {
    return getChromeHeaders();
}

/**
 * Scrape the req_key from Blinkit's landing page HTML.
 *
 * The req_key (called "requestKey" in their config) is embedded directly
 * in the server-rendered HTML inside a JSON config object, e.g.:
 *   "requestKey":"c0e6868e-1180-400c-be51-f473479f1f0a"
 *
 * Falls back to scanning JS bundles if the inline pattern isn't found.
 */
async function scrapeReqKey() {
    if (cachedReqKey) return cachedReqKey;

    console.log("[blinkit] Scraping req_key from landing page...");
    const landingRes = await impit.fetch("https://blinkit.com/", {
        headers: {
            ...chromeHeaders(),
            accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "sec-fetch-dest": "document",
            "sec-fetch-mode": "navigate",
            "sec-fetch-site": "none",
            "sec-fetch-user": "?1",
        },
    });

    if (!landingRes.ok) {
        throw new Error(
            `[likely bot-blocking] Failed to fetch Blinkit landing page: ${landingRes.status}`
        );
    }

    const landingHtml = await landingRes.text();

    // 1. Primary: look for "requestKey":"<uuid>" in the inline config JSON
    const requestKeyMatch = landingHtml.match(
        /["']requestKey["']\s*:\s*["']([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})["']/i
    );
    if (requestKeyMatch) {
        cachedReqKey = requestKeyMatch[1];
        console.log(`[blinkit] Found requestKey in HTML: ${cachedReqKey}`);
        return cachedReqKey;
    }

    // 2. Also try variations: req_key, REQ_KEY
    const altMatch = landingHtml.match(
        /(?:req[_-]?key|REQ[_-]?KEY)["'\s:=]+["']([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})["']/i
    );
    if (altMatch) {
        cachedReqKey = altMatch[1];
        console.log(`[blinkit] Found req_key in HTML: ${cachedReqKey}`);
        return cachedReqKey;
    }

    // 3. Fallback: scan JS bundles for the req_key
    console.warn("[blinkit] requestKey not found inline — scanning JS bundles...");
    const scriptMatches = [...landingHtml.matchAll(/src=["']([^"']*?\.js[^"']*?)["']/gi)];
    const bundleUrls = [
        ...new Set(
            scriptMatches.map((m) => {
                const url = m[1];
                return url.startsWith("http") ? url : `https://blinkit.com${url}`;
            })
        ),
    ].filter((u) => !u.includes("gtm.js") && !u.includes("googletagmanager")); // skip analytics

    for (const bundleUrl of bundleUrls.slice(0, 8)) {
        try {
            const bundleRes = await impit.fetch(bundleUrl, {
                headers: {
                    ...chromeHeaders(),
                    accept: "*/*",
                    referer: "https://blinkit.com/",
                    "sec-fetch-dest": "script",
                    "sec-fetch-mode": "no-cors",
                    "sec-fetch-site": "same-origin",
                },
            });
            if (!bundleRes.ok) continue;

            const js = await bundleRes.text();
            const reqKeyMatch = js.match(
                /(?:requestKey|req[_-]?key|REQ[_-]?KEY)["'\s:=]+["']([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})["']/i
            );
            if (reqKeyMatch) {
                cachedReqKey = reqKeyMatch[1];
                console.log(`[blinkit] Found req_key in bundle: ${cachedReqKey}`);
                return cachedReqKey;
            }
        } catch (err) {
            console.warn(`[blinkit] Failed to fetch bundle ${bundleUrl}: ${err.message}`);
        }
    }

    // 4. Last resort fallback
    console.warn("[blinkit] Could not scrape req_key anywhere. Using fallback — may be stale.");
    cachedReqKey = "c0e6868e-1180-400c-be51-f473479f1f0a";
    return cachedReqKey;
}

async function getAuthKey() {
    if (authKeyCache) return authKeyCache;

    const reqKey = await scrapeReqKey();
    const url = "https://blinkit.com/v2/accounts/auth_key/";

    const apiHeaders = {
        ...chromeHeaders(),
        req_key: reqKey,
        app_client: "consumer_web",
        platform: "desktop_web",
        web_app_version: "1010010001",
        rn_bundle_version: "1010003001",
        app_version: "52534332",
        device_id: DEVICE_ID,
        session_uuid: SESSION_UUID,
        accept: "application/json, text/plain, */*",
        referer: "https://blinkit.com/",
        origin: "https://blinkit.com",
    };

    // Try up to 2 times — on 403, clear cached req_key and re-scrape
    for (let attempt = 1; attempt <= 2; attempt++) {
        const res = await impit.fetch(url, {
            method: "GET",
            headers: { ...apiHeaders, req_key: await scrapeReqKey() },
        });

        if (res.status === 403 && attempt === 1) {
            console.warn(
                "[blinkit] auth_key returned 403 — clearing req_key cache and retrying..."
            );
            cachedReqKey = null; // force re-scrape
            continue;
        }

        if (!res.ok) {
            const err = new Error(`Failed to get Blinkit auth_key: ${res.status}`);
            err.blocked = [403, 429].includes(res.status);
            throw err;
        }

        const body = await res.json();
        if (!body?.auth_key) {
            throw new Error("Blinkit auth_key not found in response");
        }
        authKeyCache = body.auth_key;
        return authKeyCache;
    }
}

async function searchBlinkit(query, lat, lon) {
    const authKey = await getAuthKey();
    const url = `https://blinkit.com/v1/layout/search?q=${encodeURIComponent(
        query
    )}&search_type=type_to_search`;
    const res = await impit.fetch(url, {
        method: "POST",
        headers: {
            ...chromeHeaders(),
            app_client: "consumer_web",
            platform: "desktop_web",
            web_app_version: "1010010001",
            rn_bundle_version: "1010003001",
            app_version: "52534332",
            device_id: DEVICE_ID,
            session_uuid: SESSION_UUID,
            auth_key: authKey,
            lat: String(lat),
            lon: String(lon),
            cookie: `gr_1_deviceId=${DEVICE_ID}`,
            "content-type": "application/json",
            accept: "application/json, text/plain, */*",
            referer: "https://blinkit.com/",
            origin: "https://blinkit.com",
        },
        body: JSON.stringify({
            applied_filters: null,
            sort: "",
            previous_search_query: query,
        }),
    });
    if (!res.ok) {
        const err = new Error(`Blinkit search failed with status ${res.status}`);
        err.blocked = [403, 429].includes(res.status);
        throw err;
    }
    return res.json();
}

function asNum(v) {
    if (typeof v === "number") return v;
    if (typeof v === "string") {
        const n = Number(v.replace(/[^\d.]/g, ""));
        return Number.isFinite(n) ? n : undefined;
    }
    return undefined;
}

function textOf(v) {
    if (typeof v === "string") return v;
    if (v && typeof v === "object" && "text" in v) return v.text;
    return undefined;
}

function extractProducts(root) {
    const out = new Map();
    const seen = new Set();

    const visit = (node) => {
        if (!node || typeof node !== "object") return;
        if (seen.has(node)) return;
        seen.add(node);

        if (Array.isArray(node)) {
            node.forEach(visit);
            return;
        }

        const obj = node;
        const cartItem =
            obj?.atc_action?.add_to_cart?.cart_item ?? obj?.rfc_action?.remove_from_cart?.cart_item;

        const pid = asNum(obj.product_id ?? obj.type_id ?? cartItem?.product_id);
        const looksProduct =
            pid !== undefined &&
            (cartItem || obj.atc_action || obj.normal_price || obj.mrp || obj.assets);

        if (pid !== undefined && looksProduct) {
            const existing = out.get(pid);
            const product = existing ?? { product_id: pid, name: "" };

            product.name =
                product.name ||
                textOf(obj.display_name) ||
                textOf(obj.name) ||
                cartItem?.display_name ||
                cartItem?.product_name ||
                obj.group_name ||
                "";

            product.brand =
                product.brand ?? (textOf(obj.brand_name) || obj.brand || cartItem?.brand);
            product.unit = product.unit ?? (textOf(obj.variant) || obj.unit || cartItem?.unit);
            product.price =
                product.price ??
                asNum(textOf(obj.normal_price)) ??
                asNum(obj.price) ??
                cartItem?.price;
            product.mrp = product.mrp ?? asNum(textOf(obj.mrp)) ?? asNum(obj.mrp) ?? cartItem?.mrp;
            product.inventory = product.inventory ?? asNum(obj.inventory) ?? cartItem?.inventory;
            product.merchant_id =
                product.merchant_id ?? asNum(obj.merchant_id) ?? cartItem?.merchant_id;
            product.merchant_type =
                product.merchant_type ?? obj.merchant_type ?? cartItem?.merchant_type;
            product.eta = product.eta ?? textOf(obj?.eta_tag?.title) ?? textOf(obj?.eta_tag);
            product.image = product.image ?? obj?.image?.url ?? obj?.assets?.[0]?.image_url;

            if (cartItem && !product.cart_item) product.cart_item = cartItem;

            out.set(pid, product);
        }

        for (const key of Object.keys(obj)) visit(obj[key]);
    };

    visit(root);
    return [...out.values()].filter((p) => p.name);
}

export default {
    key: "blinkit",
    label: "Blinkit",

    /** Re-verify that the product is still in stock at the target coordinates. */
    async verify(product, pincodes = []) {
        const results = await this.search(product.title, { pincodes });
        const match = results.find((r) => r.id === product.id);
        return {
            level: "page",
            buyable: match?.inStock === true,
            reason: match
                ? `location stock ${match.inStock ? "available" : "unavailable"}`
                : "no longer in location catalog",
        };
    },

    /** Hyperlocal check: search at coordinate context of each pincode. */
    async checkPincodes(product, pincodes) {
        const map = {};
        for (const pin of pincodes) {
            try {
                const results = await this.search(product.title, { pincodes: [pin] });
                const match = results.find((r) => r.id === product.id);
                map[pin] = match?.inStock === true;
            } catch {
                map[pin] = null;
            }
        }
        return map;
    },

    async search(query, { pincodes = [] } = {}) {
        const [lat, lon] = latLongForPincode(pincodes[0] ?? "110001");
        const data = await searchBlinkit(query, lat, lon);
        const products = extractProducts(data);

        return products.map((p) => {
            const inStock = p.inventory > 0 || (p.cart_item && p.inventory !== 0);
            return {
                site: this.key,
                siteLabel: this.label,
                id: String(p.product_id),
                title: [p.brand, p.name].filter(Boolean).join(" "),
                url: `https://blinkit.com/prn/dummy/prid/${p.product_id}`,
                price: p.price ? Math.round(Number(p.price)) : null,
                inStock: inStock === true,
            };
        });
    },
};
