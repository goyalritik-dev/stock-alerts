import { getText } from "../lib/http.js";

/**
 * Reliance Digital — two-stage:
 * 1. The search page server-renders a schema.org ItemList (names + URLs).
 * 2. Each relevant product page carries a Product ld+json block with
 *    price and availability (schema.org/InStock or /OutOfStock).
 */
const BASE = "https://www.reliancedigital.in";
const MAX_DETAIL_FETCHES = 6;

// Fynd storefront credentials embedded in Reliance's own pages
// (application id from page JSON, token from their app config).
const FYND_APP_ID = "645a057875d8c4882b096f7e";
const FYND_APP_TOKEN = "__-O44-4i";

function extractLdJsonBlocks(html) {
    const blocks = [];
    const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
    let match;
    while ((match = re.exec(html))) {
        try {
            blocks.push(JSON.parse(decodeEntities(match[1].trim())));
        } catch {
            // malformed block — skip
        }
    }
    return blocks;
}

function decodeEntities(text) {
    return text
        .replace(/&#x2F;/g, "/")
        .replace(/&#x3D;/g, "=")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&");
}

function normalizeUrl(url) {
    if (!url) return null;
    if (url.startsWith("http")) return url;
    if (url.startsWith("www.")) return `https://${url}`;
    return `${BASE}${url}`;
}

export default {
    key: "relianceDigital",
    label: "Reliance Digital",

    /**
     * Pincode-aware check via the Fynd storefront API that Reliance's own
     * PDP calls when you enter a pincode. The PDP's ld+json says InStock
     * even for unbuyable products; this endpoint returns 400 "Out of
     * Stock" for pincodes it can't fulfil — exactly the behaviour a user
     * sees after entering their pincode.
     */
    async verify(product, pincodes = []) {
        const pin = pincodes[0] ?? "110001";
        const slug = product.id;
        const auth =
            "Bearer " +
            Buffer.from(`${FYND_APP_ID}:${FYND_APP_TOKEN}`).toString("base64");

        const sizesRes = await fetch(
            `${BASE}/api/service/application/catalog/v1.0/products/${slug}/sizes/`,
            {
                headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json", authorization: auth },
                signal: AbortSignal.timeout(15000),
            }
        );
        if (!sizesRes.ok) {
            return { level: "page", buyable: false, reason: `sizes API ${sizesRes.status}` };
        }
        const sizes = await sizesRes.json();
        if (sizes.sellable !== true) {
            return { level: "page", buyable: false, reason: "not sellable" };
        }
        const size = sizes.sizes?.find((s) => s.is_available) ?? sizes.sizes?.[0];
        if (!size) {
            return { level: "page", buyable: false, reason: "no available size" };
        }

        // Pincode-specific: 200 = deliverable, 400 "Out of Stock" = not.
        const priceRes = await fetch(
            `${BASE}/api/service/application/catalog/v3.0/products/${slug}/sizes/${encodeURIComponent(size.value)}/price/?pincode=${pin}`,
            {
                headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json", authorization: auth },
                signal: AbortSignal.timeout(15000),
            }
        );
        if (priceRes.ok) {
            return { level: "page", buyable: true, reason: `deliverable to ${pin}` };
        }
        const err = await priceRes.text();
        return {
            level: "page",
            buyable: false,
            reason: `pincode ${pin}: ${err.slice(0, 60) || priceRes.status}`,
        };
    },

    /** Per-pincode deliverability using the same Fynd price endpoint. */
    async checkPincodes(product, pincodes) {
        const auth =
            "Bearer " +
            Buffer.from(`${FYND_APP_ID}:${FYND_APP_TOKEN}`).toString("base64");
        const map = {};
        for (const pin of pincodes) {
            try {
                const res = await fetch(
                    `${BASE}/api/service/application/catalog/v3.0/products/${product.id}/sizes/OS/price/?pincode=${pin}`,
                    {
                        headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json", authorization: auth },
                        signal: AbortSignal.timeout(15000),
                    }
                );
                map[pin] = res.ok;
            } catch {
                map[pin] = null;
            }
        }
        return map;
    },

    async search(query) {
        const html = await getText(
            `${BASE}/products?q=${encodeURIComponent(query)}`
        );

        const items = [];
        for (const block of extractLdJsonBlocks(html)) {
            if (block?.["@type"] === "ItemList") {
                for (const entry of block.itemListElement ?? []) {
                    if (entry?.name && entry?.url) {
                        items.push({ name: entry.name, url: normalizeUrl(entry.url) });
                    }
                }
            }
        }

        // Only fetch product pages for entries that look like PlayStation
        // hardware; final include/exclude filtering happens in the engine.
        const relevant = items
            .filter((i) => /playstation|ps5/i.test(i.name))
            .slice(0, MAX_DETAIL_FETCHES);

        // Fetch product pages in parallel for speed
        const detailResults = await Promise.allSettled(
            relevant.map(async (item) => {
                const id = item.url.split("?")[0].split("/").filter(Boolean).pop();
                const productHtml = await getText(item.url);
                let price = null;
                let inStock = false;
                for (const block of extractLdJsonBlocks(productHtml)) {
                    const products = (Array.isArray(block) ? block : [block]).filter(
                        (b) => b?.["@type"] === "Product"
                    );
                    for (const product of products) {
                        const offers = product.offers ?? {};
                        price = offers.price ? Math.round(Number(offers.price)) : price;
                        inStock = /InStock/i.test(String(offers.availability ?? ""));
                    }
                }
                return {
                    site: this.key,
                    siteLabel: this.label,
                    id,
                    title: item.name,
                    url: item.url,
                    price,
                    inStock,
                };
            })
        );

        const results = [];
        for (const r of detailResults) {
            if (r.status === "fulfilled") {
                results.push(r.value);
            } else {
                console.error(`[relianceDigital] detail fetch failed: ${r.reason.message}`);
            }
        }
        return results;
    },
};
