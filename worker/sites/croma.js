import { getJson } from "../lib/http.js";

/**
 * Croma (Tata) — official search API used by their PWA.
 * Note: works with Node's fetch but NOT curl (Akamai TLS fingerprinting).
 * `stockFlag` is an array of store codes holding stock — empty means
 * not orderable anywhere. Pincode-level delivery check comes later via
 * their deliverability API.
 */
const API = "https://api.croma.com/searchservices/v1/search";
const BASE = "https://www.croma.com";
const DELIVERY_API = "https://api.croma.com/product/allchannels/v1/pdp/deliveryoption";

/**
 * Check deliverability for a single pincode using Croma's delivery API.
 */
async function checkDelivery(productCode, pincode) {
    const delivery = await getJson(
        `${DELIVERY_API}?productCode=${productCode}&pincode=${pincode}`,
        { headers: { Origin: BASE, Referer: `${BASE}/` } }
    );
    return (
        delivery.stockAvailable === true &&
        (delivery.homeDeliveryFlag === true || delivery.storePickupFlag === true)
    );
}

export default {
    key: "croma",
    label: "Croma",

    /**
     * Two signals, both must agree:
     * 1. deliveryoption API for the first configured pincode
     *    (stockAvailable + a delivery mode enabled)
     * 2. PDP ld+json offers.availability (schema.org/InStock)
     * The search stockFlag alone is stale, so this guards against it.
     */
    async verify(product, pincodes = []) {
        const pin = pincodes[0] ?? "110001";
        const deliverable = await checkDelivery(product.id, pin);
        if (!deliverable) {
            return {
                level: "page",
                buyable: false,
                reason: `deliveryoption says not deliverable to ${pin}`,
            };
        }

        const { getText } = await import("../lib/http.js");
        const html = await getText(product.url);
        const inStockLd = /"availability"\s*:\s*"[^"]*InStock/i.test(html);
        const outOfStockLd = /"availability"\s*:\s*"[^"]*Out\s?of\s?Stock/i.test(html);
        const buyable = inStockLd && !outOfStockLd;
        return {
            level: "page",
            buyable,
            reason: buyable
                ? "deliverable + PDP schema InStock"
                : `PDP schema availability inStock=${inStockLd} outOfStock=${outOfStockLd}`,
        };
    },

    /**
     * Per-pincode serviceability using Croma's delivery option API.
     * Checks each configured pincode in parallel.
     */
    async checkPincodes(product, pincodes) {
        const results = await Promise.allSettled(
            pincodes.map((pin) => checkDelivery(product.id, pin))
        );
        const map = {};
        for (let i = 0; i < pincodes.length; i++) {
            const r = results[i];
            map[pincodes[i]] = r.status === "fulfilled" ? r.value : null;
        }
        return map;
    },

    async search(query) {
        const params = new URLSearchParams({
            currentPage: "0",
            query: `${query}:relevance`,
            fields: "FULL",
            channel: "WEB",
            channelCode: "012001",
            spellOpt: "DEFAULT",
        });
        const data = await getJson(`${API}?${params}`, {
            headers: {
                Origin: BASE,
                Referer: `${BASE}/`,
            },
        });

        return (data.products ?? []).map((p) => ({
            site: this.key,
            siteLabel: this.label,
            id: String(p.code),
            title: p.name ?? "",
            url: p.url?.startsWith("http") ? p.url : `${BASE}${p.url}`,
            price: p.price?.value ?? null,
            inStock: Array.isArray(p.stockFlag) && p.stockFlag.length > 0,
        }));
    },
};
