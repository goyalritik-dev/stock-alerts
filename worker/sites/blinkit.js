import { Impit } from "impit";
import { randomUUID } from "crypto";
import { latLongForPincode } from "../lib/pincode.js";

const impit = new Impit({ browser: "chrome" });

let authKeyCache = null;
const REQ_KEY = "c0e6868e-1180-400c-be51-f473479f1f0a";
const DEVICE_ID = "33280fe624c2cf3f";
const SESSION_UUID = randomUUID();

async function getAuthKey() {
    if (authKeyCache) return authKeyCache;
    const url = "https://blinkit.com/v2/accounts/auth_key/";
    const res = await impit.fetch(url, {
        method: "GET",
        headers: {
            req_key: REQ_KEY,
            app_client: "consumer_web",
            platform: "desktop_web",
            web_app_version: "1008010016",
            rn_bundle_version: "1009003012",
            app_version: "52434332",
            device_id: DEVICE_ID,
            session_uuid: SESSION_UUID,
            "user-agent":
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
        },
    });
    if (!res.ok) {
        throw new Error(`Failed to get Blinkit auth_key: ${res.status}`);
    }
    const body = await res.json();
    if (!body?.auth_key) {
        throw new Error("Blinkit auth_key not found in response");
    }
    authKeyCache = body.auth_key;
    return authKeyCache;
}

async function searchBlinkit(query, lat, lon) {
    const authKey = await getAuthKey();
    const url = `https://blinkit.com/v1/layout/search?q=${encodeURIComponent(
        query
    )}&search_type=type_to_search`;
    const res = await impit.fetch(url, {
        method: "POST",
        headers: {
            app_client: "consumer_web",
            platform: "desktop_web",
            web_app_version: "1008010016",
            rn_bundle_version: "1009003012",
            app_version: "52434332",
            device_id: DEVICE_ID,
            session_uuid: SESSION_UUID,
            auth_key: authKey,
            lat: String(lat),
            lon: String(lon),
            cookie: `gr_1_deviceId=${DEVICE_ID}`,
            "content-type": "application/json",
            referer: "https://blinkit.com/",
            origin: "https://blinkit.com",
            "user-agent":
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
        },
        body: JSON.stringify({
            applied_filters: null,
            sort: "",
            previous_search_query: query,
        }),
    });
    if (!res.ok) {
        throw new Error(`Blinkit search failed with status ${res.status}`);
    }
    return res.json();
}

function asNum(v) {
    if (typeof v === "number") return v;
    if (typeof v === "string") {
        const n = Number(v.replace(/[^\d.]/g, ""));
        return Number.isFinite(n) ? n : undefined;
    }
    return undefined;
}

function textOf(v) {
    if (typeof v === "string") return v;
    if (v && typeof v === "object" && "text" in v) return v.text;
    return undefined;
}

function extractProducts(root) {
    const out = new Map();
    const seen = new Set();

    const visit = (node) => {
        if (!node || typeof node !== "object") return;
        if (seen.has(node)) return;
        seen.add(node);

        if (Array.isArray(node)) {
            node.forEach(visit);
            return;
        }

        const obj = node;
        const cartItem =
            obj?.atc_action?.add_to_cart?.cart_item ?? obj?.rfc_action?.remove_from_cart?.cart_item;

        const pid = asNum(obj.product_id ?? obj.type_id ?? cartItem?.product_id);
        const looksProduct =
            pid !== undefined &&
            (cartItem || obj.atc_action || obj.normal_price || obj.mrp || obj.assets);

        if (pid !== undefined && looksProduct) {
            const existing = out.get(pid);
            const product = existing ?? { product_id: pid, name: "" };

            product.name =
                product.name ||
                textOf(obj.display_name) ||
                textOf(obj.name) ||
                cartItem?.display_name ||
                cartItem?.product_name ||
                obj.group_name ||
                "";

            product.brand =
                product.brand ?? (textOf(obj.brand_name) || obj.brand || cartItem?.brand);
            product.unit = product.unit ?? (textOf(obj.variant) || obj.unit || cartItem?.unit);
            product.price =
                product.price ??
                asNum(textOf(obj.normal_price)) ??
                asNum(obj.price) ??
                cartItem?.price;
            product.mrp = product.mrp ?? asNum(textOf(obj.mrp)) ?? asNum(obj.mrp) ?? cartItem?.mrp;
            product.inventory = product.inventory ?? asNum(obj.inventory) ?? cartItem?.inventory;
            product.merchant_id =
                product.merchant_id ?? asNum(obj.merchant_id) ?? cartItem?.merchant_id;
            product.merchant_type =
                product.merchant_type ?? obj.merchant_type ?? cartItem?.merchant_type;
            product.eta = product.eta ?? textOf(obj?.eta_tag?.title) ?? textOf(obj?.eta_tag);
            product.image = product.image ?? obj?.image?.url ?? obj?.assets?.[0]?.image_url;

            if (cartItem && !product.cart_item) product.cart_item = cartItem;

            out.set(pid, product);
        }

        for (const key of Object.keys(obj)) visit(obj[key]);
    };

    visit(root);
    return [...out.values()].filter((p) => p.name);
}

export default {
    key: "blinkit",
    label: "Blinkit",

    /** Re-verify that the product is still in stock at the target coordinates. */
    async verify(product, pincodes = []) {
        const results = await this.search(product.title, { pincodes });
        const match = results.find((r) => r.id === product.id);
        return {
            level: "page",
            buyable: match?.inStock === true,
            reason: match
                ? `location stock ${match.inStock ? "available" : "unavailable"}`
                : "no longer in location catalog",
        };
    },

    /** Hyperlocal check: search at coordinate context of each pincode. */
    async checkPincodes(product, pincodes) {
        const map = {};
        for (const pin of pincodes) {
            try {
                const results = await this.search(product.title, { pincodes: [pin] });
                const match = results.find((r) => r.id === product.id);
                map[pin] = match?.inStock === true;
            } catch {
                map[pin] = null;
            }
        }
        return map;
    },

    async search(query, { pincodes = [] } = {}) {
        const [lat, lon] = latLongForPincode(pincodes[0] ?? "110001");
        const data = await searchBlinkit(query, lat, lon);
        const products = extractProducts(data);

        return products.map((p) => {
            const inStock = p.inventory > 0 || (p.cart_item && p.inventory !== 0);
            return {
                site: this.key,
                siteLabel: this.label,
                id: String(p.product_id),
                title: [p.brand, p.name].filter(Boolean).join(" "),
                url: `https://blinkit.com/prn/dummy/prid/${p.product_id}`,
                price: p.price ? Math.round(Number(p.price)) : null,
                inStock: inStock === true,
            };
        });
    },
};
