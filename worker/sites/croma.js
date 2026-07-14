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

export default {
    key: "croma",
    label: "Croma",

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
