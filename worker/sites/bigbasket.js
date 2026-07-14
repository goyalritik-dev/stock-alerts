import { latLongForPincode } from "../lib/pincode.js";

/**
 * BigBasket (quick commerce) — location-scoped catalog. Their listing
 * API needs a warm cookie jar plus a base64 `_bb_lat_long` cookie; it
 * then returns products serviceable at that location with an
 * availability.avail_status ("001" = orderable) and a not_for_sale flag.
 *
 * Note: BigBasket is a grocery/essentials platform, so a PS5 console is
 * unlikely — but if a seller ever lists one at your location, this
 * catches it. The location itself IS the serviceability check, so a hit
 * here is already deliverable to that pincode.
 */
const UA =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const BASE = "https://www.bigbasket.com";

async function warmCookieJar(lat, lon) {
    const res = await fetch(`${BASE}/`, {
        headers: { "User-Agent": UA, Accept: "text/html" },
        signal: AbortSignal.timeout(15000),
    });
    const jar = (res.headers.getSetCookie() || []).map((c) => c.split(";")[0]);
    jar.push("_bb_lat_long=" + Buffer.from(`${lat}|${lon}`).toString("base64"));
    return jar.join("; ");
}

export default {
    key: "bigbasket",
    label: "BigBasket",

    /**
     * BigBasket search is already location-scoped, so avail_status "001"
     * from the search response reflects real store stock at that pincode.
     * Re-run the search and confirm the product is still orderable.
     */
    async verify(product, pincodes = []) {
        const results = await this.search("ps5", { pincodes });
        const match = results.find((r) => r.id === product.id);
        return {
            level: "page",
            buyable: match?.inStock === true,
            reason: match
                ? `store avail_status ${match.inStock ? "orderable" : "not orderable"}`
                : "no longer in location catalog",
        };
    },

    /** The location IS the serviceability check for quick commerce. */
    async checkPincodes(product, pincodes) {
        const map = {};
        for (const pin of pincodes) map[pin] = product.inStock === true;
        return map;
    },

    async search(query, { pincodes = [] } = {}) {
        const [lat, lon] = latLongForPincode(pincodes[0] ?? "110001");
        const cookie = await warmCookieJar(lat, lon);

        const res = await fetch(
            `${BASE}/listing-svc/v2/products?type=ps&slug=${encodeURIComponent(query)}&page=1`,
            {
                headers: {
                    "User-Agent": UA,
                    Accept: "application/json",
                    Referer: `${BASE}/ps/?q=${encodeURIComponent(query)}`,
                    "x-channel": "BB-WEB",
                    Cookie: cookie,
                },
                signal: AbortSignal.timeout(15000),
            }
        );
        if (!res.ok) throw new Error(`listing API ${res.status}`);
        const data = await res.json();

        const products = data.tabs?.flatMap((t) => t.product_info?.products ?? []) ?? [];
        return products.map((p) => {
            const avail = p.availability ?? {};
            return {
                site: this.key,
                siteLabel: this.label,
                id: String(p.id),
                title: [p.brand?.name, p.desc].filter(Boolean).join(" "),
                url: p.absolute_url?.startsWith("http")
                    ? p.absolute_url
                    : `${BASE}${p.absolute_url ?? ""}`,
                price: p.pricing?.discount?.prim_price?.sp
                    ? Math.round(Number(p.pricing.discount.prim_price.sp))
                    : p.pricing?.sp
                        ? Math.round(Number(p.pricing.sp))
                        : null,
                inStock: avail.avail_status === "001" && avail.not_for_sale !== true,
            };
        });
    },
};
