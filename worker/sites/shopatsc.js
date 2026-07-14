import { getJson } from "../lib/http.js";

/**
 * Sony ShopAtSC (Sony Center India) — Shopify store.
 * The full catalog is exposed via /products.json (250 per page).
 * PS5 consoles get delisted entirely when out of stock, so a full
 * catalog scan is the reliable way to catch them reappearing.
 */
const BASE = "https://www.shopatsc.com";

export default {
    key: "shopatsc",
    label: "Sony ShopAtSC",

    /**
     * Real add-to-cart simulation (Shopify cart/add.js). 200 = the item
     * genuinely went into a cart; 422 = Shopify refused (no stock).
     */
    async verify(product) {
        const handle = product.id;
        const detail = await getJson(`${BASE}/products/${handle}.js`);
        const variant = (detail.variants ?? []).find((v) => v.available);
        if (!variant) {
            return { level: "page", buyable: false, reason: "no available variant" };
        }
        const res = await fetch(`${BASE}/cart/add.js`, {
            method: "POST",
            headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            body: JSON.stringify({ id: variant.id, quantity: 1 }),
            signal: AbortSignal.timeout(15000),
        });
        if (res.ok) {
            return { level: "cart", buyable: true, reason: "added to cart OK" };
        }
        return {
            level: "cart",
            buyable: false,
            reason: `cart add rejected (${res.status})`,
        };
    },

    async search(query) {
        const terms = query.toLowerCase().split(/\s+/);
        const results = [];

        for (let page = 1; page <= 8; page++) {
            const data = await getJson(`${BASE}/products.json?limit=250&page=${page}`);
            const products = data.products ?? [];
            if (products.length === 0) break;

            for (const product of products) {
                const title = product.title;
                const t = title.toLowerCase();
                // Coarse filter: any query term present; strict matching happens in the engine
                if (!terms.some((term) => t.includes(term))) continue;

                const variant = product.variants?.[0];
                results.push({
                    site: this.key,
                    siteLabel: this.label,
                    id: product.handle,
                    title,
                    url: `${BASE}/products/${product.handle}`,
                    price: variant?.price ? Math.round(parseFloat(variant.price)) : null,
                    inStock: product.variants?.some((v) => v.available) ?? false,
                });
            }
        }
        return results;
    },
};
