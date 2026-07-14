import { getJson } from "../lib/http.js";

/**
 * Vijay Sales — Unbxd hosted search (key extracted from their site JS).
 * Each product carries per-city stock fields like:
 *   cityId_10_cityName_unx_ts = "DELHI"
 *   cityId_10_status_unx_ts   = "Available" | "Unavailable"
 * A product counts as in stock if ANY city has it Available; city-level
 * matching against configured pincodes lands with the pincode step.
 */
const API_KEY = "8fc347a76624a5afc4401185fc4a930f";
const SITE_KEY = "ss-unbxd-aapac-dev-vijaysales-magento33881704868425";
const API = `https://search.unbxd.io/${API_KEY}/${SITE_KEY}/search`;

function cityAvailability(product) {
    const cities = [];
    for (const [field, value] of Object.entries(product)) {
        const match = /^cityId_(\d+)_status_unx_ts$/.exec(field);
        if (!match) continue;
        cities.push({
            cityId: match[1],
            cityName: product[`cityId_${match[1]}_cityName_unx_ts`] ?? null,
            available: String(value).toLowerCase() === "available",
        });
    }
    return cities;
}

export default {
    key: "vijaySales",
    label: "Vijay Sales",

    /**
     * The Unbxd index lags real stock badly (its "Available" cities showed
     * products whose PDP says OutofStock). Verify against the PDP's
     * schema.org offers block instead.
     */
    async verify(product) {
        const { getText } = await import("../lib/http.js");
        const html = await getText(product.url);
        const inStockLd = /"availability"\s*:\s*"[^"]*\/InStock/i.test(html);
        const outOfStockLd = /"availability"\s*:\s*"[^"]*Out\s?of\s?Stock/i.test(html);
        const buyable = inStockLd && !outOfStockLd;
        return {
            level: "page",
            buyable,
            reason: buyable
                ? "PDP schema InStock"
                : `PDP schema inStock=${inStockLd} outOfStock=${outOfStockLd}`,
        };
    },

    /**
     * City-level serviceability from the data already fetched in search().
     * Returns { [pincode]: true | false | null } (null = city unknown).
     */
    async checkPincodes(product, pincodes) {
        const { cityForPincode } = await import("../lib/pincode.js");
        const map = {};
        for (const pin of pincodes) {
            const city = cityForPincode(pin);
            if (!city) {
                map[pin] = null;
                continue;
            }
            const entry = (product.cities ?? []).find(
                (c) => c.cityName?.toUpperCase() === city
            );
            map[pin] = entry ? entry.available : null;
        }
        return map;
    },

    async search(query) {
        const params = new URLSearchParams({ q: query, rows: "12" });
        const data = await getJson(`${API}?${params}`);

        return (data.response?.products ?? []).map((p) => {
            const cities = cityAvailability(p);
            const title = Array.isArray(p.title) ? p.title[0] : p.title;
            const rawUrl = Array.isArray(p.productUrl) ? p.productUrl[0] : p.productUrl;
            return {
                site: this.key,
                siteLabel: this.label,
                id: String(p._root_ ?? p.sku ?? rawUrl),
                title: title ?? "",
                url: (rawUrl ?? "").replace("stage.vijaysales.com", "www.vijaysales.com"),
                price: p.price ? Math.round(Number(p.price)) : null,
                inStock: cities.some((c) => c.available),
                // extra data the pincode step will consume
                cities,
            };
        });
    },
};
