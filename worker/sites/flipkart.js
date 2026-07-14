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

const PDP_HEADERS = {
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
};

/** Fallback when the rome API is blocked: PDP embedded-state check. */
async function verifyViaPdp(product) {
    const html = await getText(product.url, { headers: PDP_HEADERS });
    let raw;
    try {
        raw = JSON.stringify(extractInitialState(html));
    } catch {
        return { level: "page", buyable: false, reason: "PDP state missing (bot wall?)" };
    }
    const nonBuyable = raw.includes('"nonBuyable":true');
    const outOfStock =
        raw.includes('"availabilityStatus":"OUT_OF_STOCK"') ||
        raw.includes('"COMING_SOON"');
    const buyNowValid = /"type":"BUY_NOW","params":\{"valid":true/.test(raw);
    const buyable = buyNowValid && !nonBuyable && !outOfStock;
    return {
        level: "page",
        buyable,
        reason: `PDP fallback (no pincode): buyNowValid=${buyNowValid} nonBuyable=${nonBuyable} outOfStock=${outOfStock}`,
    };
}

export default {
    key: "flipkart",
    label: "Flipkart",

    /**
     * Pincode-aware check via Flipkart's internal page-fetch API (the one
     * their PWA calls when you enter a pincode). Without a pincode the PDP
     * shows phantom listings as IN_STOCK; with locationContext the same
     * response carries "serviceable":false. That mirrors exactly what a
     * user sees after typing their pincode.
     */
    async verify(product, pincodes = []) {
        const pin = pincodes[0] ?? "110001";
        const pageUri = product.url.replace("https://www.flipkart.com", "");
        const res = await fetch("https://2.rome.api.flipkart.com/api/4/page/fetch", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                "X-User-Agent": "Mozilla/5.0 FKUA/website/42/website/Desktop",
                Origin: BASE,
                Referer: `${BASE}/`,
            },
            body: JSON.stringify({
                pageUri,
                pageContext: { fetchSeoData: false, pincode: pin },
                locationContext: { pincode: pin },
            }),
            signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) {
            return await verifyViaPdp(product);
        }
        const raw = await res.text();

        const unserviceable = raw.includes('"serviceable":false');
        const outOfStock =
            raw.includes('"availabilityStatus":"OUT_OF_STOCK"') ||
            raw.includes('"COMING_SOON"');
        const nonBuyable = raw.includes('"nonBuyable":true');
        const inStock = raw.includes('"availabilityStatus":"IN_STOCK"');

        const buyable = inStock && !unserviceable && !outOfStock && !nonBuyable;
        return {
            level: "page",
            buyable,
            reason: buyable
                ? `serviceable to ${pin} and IN_STOCK`
                : `pincode ${pin}: serviceable=${!unserviceable} inStock=${inStock} outOfStock=${outOfStock} nonBuyable=${nonBuyable}`,
        };
    },


    /** Per-pincode serviceability via the same page-fetch API. */
    async checkPincodes(product, pincodes) {
        const map = {};
        for (const pin of pincodes) {
            try {
                const result = await this.verify(product, [pin]);
                map[pin] = result.buyable;
            } catch {
                map[pin] = null;
            }
        }
        return map;
    },

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
