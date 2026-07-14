import { getText } from "../lib/http.js";

/**
 * Flipkart — the search page embeds window.__INITIAL_STATE__ JSON with
 * PRODUCT_SUMMARY widgets carrying title, price and an explicit
 * availability displayState (IN_STOCK / COMING_SOON / OUT_OF_STOCK).
 */
const BASE = "https://www.flipkart.com";

function extractInitialState(html) {
    const marker = "window.__INITIAL_STATE__ = ";
    const start = html.indexOf(marker);
    if (start === -1) throw new Error("no __INITIAL_STATE__ in page (bot wall?)");
    const end = html.indexOf("};", start);
    return JSON.parse(html.slice(start + marker.length, end + 1));
}

export default {
    key: "flipkart",
    label: "Flipkart",

    async search(query) {
        const html = await getText(
            `${BASE}/search?q=${encodeURIComponent(query)}`,
            { headers: { "Upgrade-Insecure-Requests": "1" } }
        );
        const state = extractInitialState(html);

        const results = [];
        const slotGroups = state?.pageDataV4?.page?.data ?? {};
        for (const slots of Object.values(slotGroups)) {
            for (const slot of slots) {
                const widget = slot?.widget;
                if (widget?.type !== "PRODUCT_SUMMARY") continue;
                for (const product of widget?.data?.products ?? []) {
                    const value = product?.productInfo?.value;
                    if (!value?.titles?.title) continue;

                    const url = value.smartUrl || value.baseUrl || "";
                    const pid = /[?&]pid=([A-Z0-9]+)/.exec(url)?.[1] ?? value.id ?? url;
                    results.push({
                        site: this.key,
                        siteLabel: this.label,
                        id: pid,
                        title: value.titles.title,
                        url: url.startsWith("http") ? url : `${BASE}${url}`,
                        price: value.pricing?.prices?.[0]?.value ?? null,
                        inStock: value.availability?.displayState === "IN_STOCK",
                    });
                }
            }
        }
        return results;
    },
};
