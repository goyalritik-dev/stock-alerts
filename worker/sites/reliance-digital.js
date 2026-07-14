import { getText } from "../lib/http.js";

/**
 * Reliance Digital — two-stage:
 * 1. The search page server-renders a schema.org ItemList (names + URLs).
 * 2. Each relevant product page carries a Product ld+json block with
 *    price and availability (schema.org/InStock or /OutOfStock).
 */
const BASE = "https://www.reliancedigital.in";
const MAX_DETAIL_FETCHES = 6;

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

        const results = [];
        for (const item of relevant) {
            const id = item.url.split("?")[0].split("/").filter(Boolean).pop();
            try {
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
                results.push({
                    site: this.key,
                    siteLabel: this.label,
                    id,
                    title: item.name,
                    url: item.url,
                    price,
                    inStock,
                });
            } catch (error) {
                console.error(`[relianceDigital] detail fetch failed for ${id}: ${error.message}`);
            }
        }
        return results;
    },
};
