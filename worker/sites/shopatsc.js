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
